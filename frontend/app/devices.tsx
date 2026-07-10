/**
 * Bluetooth Devices Screen
 *
 * Accessible from Profile → Connected Devices card (router.push('/devices')).
 * Allows users to scan for BLE fitness devices, connect, and view live stats.
 *
 * NATIVE BUILD REQUIRED:
 * BLE scanning / connection are NOT available in Expo Go or web preview.
 * A native development / production build is required for this feature.
 */
import React, { useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useBLEContext, BLEDeviceInfo } from '@/src/context/BLEContext';
import { colors, radius, fonts } from '@/src/theme';

// ─── Signal strength bars ──────────────────────────────────────────────────────

function SignalBars({ rssi }: { rssi: number }) {
  const level = rssi >= -55 ? 4 : rssi >= -65 ? 3 : rssi >= -75 ? 2 : 1;
  return (
    <View style={{ flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: 20 }}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            width: 4,
            height: 4 + i * 4,
            borderRadius: 2,
            backgroundColor: i <= level ? colors.brand : colors.borderStrong,
            opacity: i <= level ? 1 : 0.35,
          }}
        />
      ))}
    </View>
  );
}

// ─── Live Metric Badge ────────────────────────────────────────────────────────

function LiveBadge({
  icon, color, label, value, live,
}: {
  icon: any; color: string; label: string; value: string; live?: boolean;
}) {
  return (
    <View style={lb.wrap}>
      <View style={[lb.iconBg, { backgroundColor: color + '22' }]}>
        {live && <View style={lb.liveDot} />}
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={lb.val}>{value}</Text>
      <Text style={lb.lbl}>{label}</Text>
    </View>
  );
}

const lb = StyleSheet.create({
  wrap: { alignItems: 'center', flex: 1 },
  iconBg: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  liveDot: {
    position: 'absolute', top: -2, right: -2, zIndex: 1,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.success, borderWidth: 1.5, borderColor: colors.surfaceSecondary,
  },
  val: { fontFamily: fonts.display, fontSize: 15, color: colors.onSurface, letterSpacing: 0.3 },
  lbl: {
    fontFamily: fonts.text, fontSize: 10,
    color: colors.onSurfaceSecondary, textTransform: 'uppercase', marginTop: 2,
  },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function DevicesScreen() {
  const insets = useSafeAreaInsets();
  const {
    isBLEAvailable, bleState, blePermission, isScanning,
    discoveredDevices, connectedDevice, heartRate, bleSteps,
    bleCadence, batteryLevel, requestBLEPermission,
    startScan, stopScan, connectDevice, disconnectDevice,
  } = useBLEContext();

  // Rotating bluetooth icon while scanning
  const spinAnim = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isScanning) {
      loopRef.current = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1200, useNativeDriver: true })
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      spinAnim.setValue(0);
    }
    return () => loopRef.current?.stop();
  }, [isScanning, spinAnim]);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // Request Android BLE permission on mount
  useEffect(() => {
    if (isBLEAvailable && blePermission === 'unknown') {
      requestBLEPermission();
    }
  }, [isBLEAvailable, blePermission, requestBLEPermission]);

  const handleScanToggle = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!isBLEAvailable) return;
    if (blePermission !== 'granted') {
      const ok = await requestBLEPermission();
      if (!ok) return;
    }
    if (isScanning) stopScan();
    else startScan();
  }, [isBLEAvailable, blePermission, isScanning, requestBLEPermission, startScan, stopScan]);

  const handleConnect = useCallback(async (dev: BLEDeviceInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await connectDevice(dev);
  }, [connectDevice]);

  const handleDisconnect = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await disconnectDevice();
  }, [disconnectDevice]);

  const isBluetoothOff = bleState === 'PoweredOff';
  const isUnauthorized = bleState === 'Unauthorized' || blePermission === 'blocked';
  const canScan = isBLEAvailable && !isBluetoothOff && !isUnauthorized;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Configure this screen as a modal slide-up */}
      <Stack.Screen options={{ presentation: 'modal', headerShown: false }} />
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          <Text style={s.backTxt}>Profile</Text>
        </TouchableOpacity>

        <Text style={s.title}>Devices</Text>

        {canScan ? (
          <TouchableOpacity
            style={[s.scanBtn, isScanning && s.scanBtnActive]}
            onPress={handleScanToggle}
            activeOpacity={0.8}
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Ionicons
                name="bluetooth"
                size={13}
                color={isScanning ? colors.onBrand : colors.brand}
              />
            </Animated.View>
            <Text style={[s.scanBtnTxt, isScanning && s.scanBtnTxtActive]}>
              {isScanning ? 'Stop' : 'Scan'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 70 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Native Build Notice ────────────────────────────────────── */}
        {!isBLEAvailable && (
          <View style={s.infoCard}>
            <View style={s.infoIconWrap}>
              <Ionicons name="build-outline" size={32} color={colors.borderStrong} />
            </View>
            <Text style={s.infoTitle}>Native Build Required</Text>
            <Text style={s.infoBody}>
              Bluetooth scanning is not available in the web preview or Expo Go.{'\n\n'}
              Tap{' '}
              <Text style={{ color: colors.brand, fontFamily: fonts.textBold }}>Publish</Text>
              {' '}(top-right) to generate a native iOS or Android build, then test
              on a real device.
            </Text>
          </View>
        )}

        {/* ─── Bluetooth Off ───────────────────────────────────────────── */}
        {isBLEAvailable && isBluetoothOff && (
          <View style={s.infoCard}>
            <View style={[s.infoIconWrap, { backgroundColor: colors.warning + '22' }]}>
              <Ionicons name="bluetooth-outline" size={32} color={colors.warning} />
            </View>
            <Text style={s.infoTitle}>Bluetooth is Off</Text>
            <Text style={s.infoBody}>
              Turn on Bluetooth to scan for fitness trackers and bands.
            </Text>
          </View>
        )}

        {/* ─── Permission Denied ──────────────────────────────────────── */}
        {isBLEAvailable && !isBluetoothOff && isUnauthorized && (
          <View style={s.infoCard}>
            <View style={[s.infoIconWrap, { backgroundColor: colors.error + '22' }]}>
              <Ionicons name="lock-closed-outline" size={32} color={colors.error} />
            </View>
            <Text style={s.infoTitle}>Permission Required</Text>
            <Text style={s.infoBody}>
              Bluetooth permission was denied.{'\n'}Open Settings to enable it for AeroStep.
            </Text>
            <TouchableOpacity
              style={s.settingsBtn}
              onPress={() => Linking.openSettings()}
              activeOpacity={0.85}
            >
              <Text style={s.settingsBtnTxt}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Connected Device Card ───────────────────────────────────── */}
        {connectedDevice && (
          <>
            <Text style={s.sectionLabel}>CONNECTED</Text>
            <View style={s.connCard}>
              <View style={s.connHeader}>
                <View style={s.connStatusRow}>
                  <View style={s.connDot} />
                  <Text style={s.connName} numberOfLines={1}>{connectedDevice.name}</Text>
                </View>
                <TouchableOpacity
                  style={s.disconnBtn}
                  onPress={handleDisconnect}
                  activeOpacity={0.7}
                >
                  <Text style={s.disconnTxt}>Disconnect</Text>
                </TouchableOpacity>
              </View>

              {/* Live metrics */}
              <View style={s.liveGrid}>
                <LiveBadge
                  icon="heart"
                  color="#FF6B6B"
                  label="Heart Rate"
                  value={heartRate ? `${heartRate} bpm` : '—'}
                  live={!!heartRate}
                />
                <LiveBadge
                  icon="footsteps"
                  color={colors.brand}
                  label="Steps"
                  value={bleSteps > 0 ? bleSteps.toLocaleString() : '—'}
                />
                <LiveBadge
                  icon="speedometer"
                  color={colors.success}
                  label="Cadence"
                  value={bleCadence ? `${bleCadence}/m` : '—'}
                />
                <LiveBadge
                  icon="battery-half"
                  color={colors.warning}
                  label="Battery"
                  value={batteryLevel !== null ? `${batteryLevel}%` : '—'}
                />
              </View>

              <Text style={s.connFootnote}>
                Steps estimated from RSC cadence. Heart rate streams live from device.
              </Text>
            </View>
          </>
        )}

        {/* ─── Nearby Device List ─────────────────────────────────────── */}
        {canScan && (
          <>
            <Text style={s.sectionLabel}>
              {isScanning ? 'SCANNING FOR DEVICES…' : 'NEARBY DEVICES'}
            </Text>

            {isScanning && discoveredDevices.length === 0 && (
              <View style={s.scanningRow}>
                <ActivityIndicator size="small" color={colors.brand} />
                <Text style={s.scanningTxt}>Looking for fitness devices nearby…</Text>
              </View>
            )}

            {discoveredDevices.length > 0 && (
              <View style={s.deviceList}>
                {discoveredDevices.map((dev, idx) => {
                  const isConn = connectedDevice?.id === dev.id;
                  return (
                    <View
                      key={dev.id}
                      style={[
                        s.deviceRow,
                        idx < discoveredDevices.length - 1 && s.deviceRowBorder,
                      ]}
                    >
                      <View style={s.devLeft}>
                        <View style={s.devIconWrap}>
                          <Ionicons name="watch-outline" size={18} color={colors.brand} />
                        </View>
                        <View style={s.devInfo}>
                          <Text style={s.devName} numberOfLines={1}>{dev.name}</Text>
                          <Text style={s.devAddr} numberOfLines={1}>
                            {dev.id.length > 20 ? `${dev.id.substring(0, 20)}…` : dev.id}
                          </Text>
                        </View>
                      </View>
                      <View style={s.devRight}>
                        <SignalBars rssi={dev.rssi} />
                        {!isConn ? (
                          <TouchableOpacity
                            style={s.connectBtn}
                            onPress={() => handleConnect(dev)}
                            activeOpacity={0.8}
                          >
                            <Text style={s.connectBtnTxt}>Connect</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={s.activePill}>
                            <View style={s.activePillDot} />
                            <Text style={s.activePillTxt}>Active</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Empty state */}
            {!isScanning && discoveredDevices.length === 0 && (
              <View style={s.emptyState}>
                <View style={s.emptyIconWrap}>
                  <Ionicons name="bluetooth-outline" size={40} color={colors.borderStrong} />
                </View>
                <Text style={s.emptyTitle}>No Devices Found</Text>
                <Text style={s.emptyBody}>
                  Put your fitness band in pairing mode, then tap Scan.
                </Text>
                <TouchableOpacity
                  style={s.bigScanBtn}
                  onPress={handleScanToggle}
                  activeOpacity={0.85}
                >
                  <Ionicons name="search" size={16} color={colors.onBrand} />
                  <Text style={s.bigScanBtnTxt}>Start Scanning</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 80 },
  backTxt: { fontFamily: fonts.text, fontSize: 15, color: colors.brand },
  title: { fontFamily: fonts.textBold, fontSize: 17, color: colors.onSurface },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand,
    minWidth: 70, justifyContent: 'center',
  },
  scanBtnActive: { backgroundColor: colors.brand },
  scanBtnTxt: { fontFamily: fonts.textBold, fontSize: 12, color: colors.brand },
  scanBtnTxtActive: { color: colors.onBrand },
  content: { paddingHorizontal: 16, paddingTop: 20 },

  infoCard: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    marginBottom: 16, gap: 12,
  },
  infoIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center', justifyContent: 'center',
  },
  infoTitle: { fontFamily: fonts.textBold, fontSize: 18, color: colors.onSurface, textAlign: 'center' },
  infoBody: {
    fontFamily: fonts.text, fontSize: 14,
    color: colors.onSurfaceSecondary, textAlign: 'center', lineHeight: 21,
  },
  settingsBtn: {
    marginTop: 4, paddingHorizontal: 28, paddingVertical: 13,
    backgroundColor: colors.brand, borderRadius: radius.pill,
  },
  settingsBtnTxt: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onBrand },

  sectionLabel: {
    fontFamily: fonts.textBold, fontSize: 10, color: colors.onSurfaceSecondary,
    letterSpacing: 1.5, marginBottom: 10, marginTop: 4,
  },

  connCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.brand + '40',
    padding: 16, marginBottom: 24,
  },
  connHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  connStatusRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  connDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  connName: { flex: 1, fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface },
  disconnBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong,
  },
  disconnTxt: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary },
  liveGrid: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
  connFootnote: {
    fontFamily: fonts.text, fontSize: 11, color: colors.borderStrong,
    textAlign: 'center', lineHeight: 16,
  },

  scanningRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 20, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    marginBottom: 12,
  },
  scanningTxt: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceSecondary },

  deviceList: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    overflow: 'hidden', marginBottom: 16,
  },
  deviceRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  deviceRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  devLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  devIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  devInfo: { flex: 1, minWidth: 0 },
  devName: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  devAddr: { fontFamily: fonts.text, fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2 },
  devRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 8 },
  connectBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: colors.brand, borderRadius: radius.pill,
  },
  connectBtnTxt: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onBrand },
  activePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: colors.success + '22',
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.success + '40',
  },
  activePillDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.success },
  activePillTxt: { fontFamily: fonts.textBold, fontSize: 12, color: colors.success },

  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  emptyTitle: { fontFamily: fonts.textBold, fontSize: 18, color: colors.onSurface },
  emptyBody: {
    fontFamily: fonts.text, fontSize: 14,
    color: colors.onSurfaceSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24,
  },
  bigScanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 28, paddingVertical: 14,
    backgroundColor: colors.brand, borderRadius: radius.pill, marginTop: 8,
  },
  bigScanBtnTxt: { fontFamily: fonts.display, fontSize: 18, color: colors.onBrand, letterSpacing: 0.5 },
});
