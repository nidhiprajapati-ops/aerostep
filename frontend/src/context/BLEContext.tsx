/**
 * BLE Context — single source of truth for Bluetooth state.
 *
 * Wrap the root layout with <BLEProvider> to make this available app-wide.
 * All BLE functionality requires a native build; in Expo Go / web
 * isBLEAvailable will be false and all actions are graceful no-ops.
 *
 * Standard BLE profiles supported:
 *   - Heart Rate Service (0x180D) / Characteristic (0x2A37)
 *   - Running Speed & Cadence (0x1814) / (0x2A53) — step estimation via cadence
 *   - Battery Service (0x180F) / (0x2A19)
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { storage } from '@/src/utils/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StepSource = 'phone' | 'ble';
export type BLEPermStatus = 'unknown' | 'granted' | 'denied' | 'blocked';

export interface BLEDeviceInfo {
  id: string;
  name: string;
  rssi: number;
}

interface BLEContextValue {
  /** True only when the native BLE module is linked (native build). */
  isBLEAvailable: boolean;
  /** 'PoweredOn' | 'PoweredOff' | 'Unauthorized' | 'Unknown' | ... */
  bleState: string;
  blePermission: BLEPermStatus;
  isScanning: boolean;
  discoveredDevices: BLEDeviceInfo[];
  connectedDevice: BLEDeviceInfo | null;
  heartRate: number | null;
  /** Cumulative steps from RSC cadence since last device connection. */
  bleSteps: number;
  /** Current cadence in steps/min from RSC (if device supports it). */
  bleCadence: number | null;
  batteryLevel: number | null;
  /** Which source the home ring is showing. */
  stepSource: StepSource;
  /** True while attempting to auto-reconnect to last device on BT power-on. */
  isReconnecting: boolean;
  /** Name of the last saved BLE device (shown during reconnect). */
  lastConnectedName: string | null;
  requestBLEPermission: () => Promise<boolean>;
  startScan: () => void;
  stopScan: () => void;
  connectDevice: (device: BLEDeviceInfo) => Promise<void>;
  disconnectDevice: () => Promise<void>;
  setStepSource: (source: StepSource) => Promise<void>;
}

// ─── BLE module loader (graceful fallback for Expo Go / web) ─────────────────

let BleManagerClass: (new () => any) | null = null;
const CAN_USE_BLE = Platform.OS !== 'web';

if (CAN_USE_BLE) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    BleManagerClass = require('react-native-ble-plx').BleManager;
  } catch {
    // Native module not linked — running in Expo Go or web
  }
}

// ─── Standard BLE UUIDs (full 128-bit for cross-platform) ────────────────────

const UUID = {
  HR_SVC:   '0000180D-0000-1000-8000-00805F9B34FB',
  HR_CHAR:  '00002A37-0000-1000-8000-00805F9B34FB',
  RSC_SVC:  '00001814-0000-1000-8000-00805F9B34FB',
  RSC_CHAR: '00002A53-0000-1000-8000-00805F9B34FB',
  BAT_SVC:  '0000180F-0000-1000-8000-00805F9B34FB',
  BAT_CHAR: '00002A19-0000-1000-8000-00805F9B34FB',
};

// ─── Base64 → byte array ──────────────────────────────────────────────────────

function b64ToBytes(b64: string): number[] {
  try {
    const bin = atob(b64);
    return Array.from({ length: bin.length }, (_, i) => bin.charCodeAt(i));
  } catch {
    return [];
  }
}

/** Parse Heart Rate Measurement characteristic (0x2A37) */
function parseHeartRate(b64: string): number | null {
  const b = b64ToBytes(b64);
  if (b.length < 2) return null;
  const isU16 = (b[0] & 0x01) === 1;
  const hr = isU16 ? b[1] | (b[2] << 8) : b[1];
  return hr > 0 && hr < 250 ? hr : null;
}

/** Parse RSC Measurement characteristic (0x2A53) — returns cadence in steps/min */
function parseRSC(b64: string): { cadence: number } | null {
  const b = b64ToBytes(b64);
  // Layout: flags(1) speed_lo(1) speed_hi(1) cadence(1) [optional fields...]
  if (b.length < 4) return null;
  return { cadence: b[3] };
}

/** Parse Battery Level characteristic (0x2A19) */
function parseBattery(b64: string): number | null {
  const b = b64ToBytes(b64);
  return b.length >= 1 ? Math.min(100, Math.max(0, b[0])) : null;
}

// ─── Android permission helper ────────────────────────────────────────────────

async function requestAndroidBLEPerms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const ver = typeof Platform.Version === 'number'
    ? Platform.Version
    : parseInt(Platform.Version as string, 10);
  try {
    if (ver >= 31) {
      // Android 12+: BLUETOOTH_SCAN + BLUETOOTH_CONNECT (no location needed for scan)
      const res = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return (
        res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
        res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
      );
    } else {
      // Android < 12: need fine location to scan BLE
      const res = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return res === 'granted';
    }
  } catch {
    return false;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const BLEContext = createContext<BLEContextValue | null>(null);

export function useBLEContext(): BLEContextValue {
  const ctx = useContext(BLEContext);
  if (!ctx) throw new Error('useBLEContext must be used inside <BLEProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BLEProvider({ children }: { children: ReactNode }) {
  const managerRef = useRef<any>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subs = useRef<{ remove: () => void }[]>([]);
  const rscTimestampRef = useRef<number>(Date.now());
  // Used to prevent repeated auto-reconnect within a single BT power-on session
  const autoReconnectDoneRef = useRef(false);
  // Keep latest connectDevice in a ref to call from the auto-reconnect effect without
  // adding it to the effect's dep array (would cause a loop)
  const connectDeviceRef = useRef<((info: BLEDeviceInfo) => Promise<void>) | null>(null);

  const [bleState, setBleState] = useState('Unknown');
  const [blePermission, setBlePermission] = useState<BLEPermStatus>('unknown');
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<BLEDeviceInfo[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BLEDeviceInfo | null>(null);
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [bleSteps, setBleSteps] = useState(0);
  const [bleCadence, setBleCadence] = useState<number | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [stepSource, setStepSourceState] = useState<StepSource>('phone');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastConnectedName, setLastConnectedName] = useState<string | null>(null);

  // ─── Initialise BLE Manager ───────────────────────────────────────────────

  useEffect(() => {
    if (!BleManagerClass) return;
    let stateSub: { remove: () => void } | null = null;
    try {
      const mgr = new BleManagerClass();
      managerRef.current = mgr;
      stateSub = mgr.onStateChange((state: string) => setBleState(state), true);
    } catch (e) {
      console.log('[BLE] Manager init failed:', e);
    }
    return () => {
      stateSub?.remove();
      try { managerRef.current?.destroy(); } catch {}
      managerRef.current = null;
    };
  }, []);

  // ─── Restore source preference from storage ───────────────────────────────

  useEffect(() => {
    storage.getItem<string>('step_source', 'phone').then((v) => {
      if (v === 'ble' || v === 'phone') setStepSourceState(v as StepSource);
    });
  }, []);

  // ─── Restore last connected device name (for reconnect UI hint) ───────────

  useEffect(() => {
    storage.getItem<string>('ble_last_device_name', '').then((name) => {
      if (name) setLastConnectedName(name);
    });
  }, []);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const cleanupSubs = useCallback(() => {
    subs.current.forEach((s) => { try { s.remove(); } catch {} });
    subs.current = [];
  }, []);

  const stopScan = useCallback(() => {
    try { managerRef.current?.stopDeviceScan(); } catch {}
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    setIsScanning(false);
  }, []);

  // ─── Auto-reconnect when Bluetooth powers on ─────────────────────────────
  // Fires once per BT power-on session; retries on the next power-on if the
  // device was out of range the previous time.

  useEffect(() => {
    if (bleState !== 'PoweredOn' || !managerRef.current) return;
    if (autoReconnectDoneRef.current) return; // already tried this session
    autoReconnectDoneRef.current = true;

    let cancelled = false;

    const tryReconnect = async () => {
      const [savedId, savedName] = await Promise.all([
        storage.getItem<string>('ble_last_device_id', ''),
        storage.getItem<string>('ble_last_device_name', ''),
      ]);
      if (!savedId || cancelled) return;
      if (!connectDeviceRef.current) return;

      setIsReconnecting(true);
      try {
        await connectDeviceRef.current({
          id: savedId,
          name: savedName || 'Fitness Device',
          rssi: -80,
        });
      } catch {
        // Device out of range or rejected — silent failure
      } finally {
        if (!cancelled) setIsReconnecting(false);
      }
    };

    // Small delay so BLE stack settles after power-on
    const timer = setTimeout(tryReconnect, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [bleState]); // bleState is the only intentional dep; connectDevice called via ref

  // ─── Request BLE permissions ──────────────────────────────────────────────

  const requestBLEPermission = useCallback(async (): Promise<boolean> => {
    if (!BleManagerClass) {
      setBlePermission('blocked');
      return false;
    }
    const granted = await requestAndroidBLEPerms();
    setBlePermission(granted ? 'granted' : 'denied');
    return granted;
  }, []);

  // ─── Scan for devices ─────────────────────────────────────────────────────

  const startScan = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr || bleState !== 'PoweredOn') return;
    setDiscoveredDevices([]);
    setIsScanning(true);

    mgr.startDeviceScan(
      null, // null = scan all service UUIDs
      { allowDuplicates: false },
      (err: any, dev: any) => {
        if (err) { stopScan(); return; }
        if (!dev?.name) return; // skip anonymous devices
        const item: BLEDeviceInfo = {
          id: dev.id,
          name: dev.name,
          rssi: dev.rssi ?? -100,
        };
        setDiscoveredDevices((prev) => {
          const idx = prev.findIndex((d) => d.id === dev.id);
          return idx >= 0
            ? prev.map((d, i) => (i === idx ? { ...d, rssi: item.rssi } : d))
            : [...prev, item];
        });
      }
    );

    // Auto-stop after 15 seconds
    scanTimerRef.current = setTimeout(() => stopScan(), 15_000);
  }, [bleState, stopScan]);

  // ─── Connect to device ────────────────────────────────────────────────────

  const connectDevice = useCallback(async (info: BLEDeviceInfo) => {
    const mgr = managerRef.current;
    if (!mgr) return;

    stopScan();
    cleanupSubs();

    try {
      const dev = await mgr.connectToDevice(info.id, { autoConnect: false });
      await dev.discoverAllServicesAndCharacteristics();

      // Reset live data
      setConnectedDevice(info);
      setLastConnectedName(info.name);
      setBleSteps(0);
      setHeartRate(null);
      setBleCadence(null);
      setBatteryLevel(null);
      rscTimestampRef.current = Date.now();

      // Persist for UI hint on next app open
      await Promise.all([
        storage.setItem('ble_last_device_id', info.id),
        storage.setItem('ble_last_device_name', info.name),
      ]);

      // ── Heart Rate ──────────────────────────────────────────────────────
      try {
        const hrSub = dev.monitorCharacteristicForService(
          UUID.HR_SVC, UUID.HR_CHAR,
          (e: any, c: any) => {
            if (e || !c?.value) return;
            const hr = parseHeartRate(c.value);
            if (hr !== null) setHeartRate(hr);
          }
        );
        if (hrSub) subs.current.push(hrSub);
      } catch {
        // Device doesn't expose Heart Rate service
      }

      // ── Running Speed & Cadence (step estimation) ───────────────────────
      try {
        const rscSub = dev.monitorCharacteristicForService(
          UUID.RSC_SVC, UUID.RSC_CHAR,
          (e: any, c: any) => {
            if (e || !c?.value) return;
            const rsc = parseRSC(c.value);
            if (!rsc) return;
            setBleCadence(rsc.cadence);
            // Integrate: cadence (steps/min) × elapsed seconds / 60 = delta steps
            const now = Date.now();
            const elapsedSec = (now - rscTimestampRef.current) / 1000;
            rscTimestampRef.current = now;
            if (elapsedSec > 0 && elapsedSec < 5 && rsc.cadence > 0) {
              const delta = Math.round(rsc.cadence * elapsedSec / 60);
              if (delta > 0) setBleSteps((p) => p + delta);
            }
          }
        );
        if (rscSub) subs.current.push(rscSub);
      } catch {
        // Device doesn't expose RSC service
      }

      // ── Battery Level ───────────────────────────────────────────────────
      try {
        const batSub = dev.monitorCharacteristicForService(
          UUID.BAT_SVC, UUID.BAT_CHAR,
          (e: any, c: any) => {
            if (e || !c?.value) return;
            const b = parseBattery(c.value);
            if (b !== null) setBatteryLevel(b);
          }
        );
        if (batSub) subs.current.push(batSub);
      } catch {
        // Device doesn't expose Battery service
      }

      // ── Disconnection listener ──────────────────────────────────────────
      try {
        const discSub = dev.onDisconnected(() => {
          setConnectedDevice(null);
          setHeartRate(null);
          setBleCadence(null);
          cleanupSubs();
          // Allow auto-reconnect to fire again on next BT power-on cycle
          autoReconnectDoneRef.current = false;
        });
        if (discSub) subs.current.push(discSub);
      } catch {}

    } catch (e) {
      console.log('[BLE] connectDevice error:', e);
    }
  }, [stopScan, cleanupSubs]);

  // ─── Disconnect ───────────────────────────────────────────────────────────

  const disconnectDevice = useCallback(async () => {
    const mgr = managerRef.current;
    const dev = connectedDevice;
    if (!mgr || !dev) return;
    cleanupSubs();
    try { await mgr.cancelDeviceConnection(dev.id); } catch {}
    setConnectedDevice(null);
    setHeartRate(null);
    setBleCadence(null);
    setBleSteps(0);
    // Reset flag so next BT power-on will attempt auto-reconnect
    autoReconnectDoneRef.current = false;
  }, [connectedDevice, cleanupSubs]);

  // ─── Source preference ────────────────────────────────────────────────────

  const setStepSource = useCallback(async (src: StepSource) => {
    setStepSourceState(src);
    await storage.setItem('step_source', src);
  }, []);

  // Keep connectDeviceRef current so auto-reconnect effect can call it
  // without adding connectDevice to the effect's dependency array
  useEffect(() => {
    connectDeviceRef.current = connectDevice;
  });

  // ─── Context value ────────────────────────────────────────────────────────

  const value: BLEContextValue = {
    isBLEAvailable: !!BleManagerClass,
    bleState,
    blePermission,
    isScanning,
    discoveredDevices,
    connectedDevice,
    heartRate,
    bleSteps,
    bleCadence,
    batteryLevel,
    stepSource,
    isReconnecting,
    lastConnectedName,
    requestBLEPermission,
    startScan,
    stopScan,
    connectDevice,
    disconnectDevice,
    setStepSource,
  };

  return <BLEContext.Provider value={value}>{children}</BLEContext.Provider>;
}
