/**
 * Background Step Sync Task
 * Registered at app startup (imported in _layout.tsx).
 * Runs periodically to flush pending phone steps to the backend
 * while the app is in the background.
 *
 * NOTE: Background tasks require a native build — they will not run in Expo Go.
 */
import * as TaskManager from 'expo-task-manager';
import { BackgroundTaskResult } from 'expo-background-task';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BACKGROUND_STEP_TASK = 'aero-step-bg-sync';

TaskManager.defineTask(BACKGROUND_STEP_TASK, async () => {
  try {
    const [pendingRaw, deviceIdRaw] = await Promise.all([
      AsyncStorage.getItem('bg_pending_steps'),
      AsyncStorage.getItem('device_id'), // storage util JSON-encodes values
    ]);

    // storage utility JSON-encodes values, so device_id comes back as '"dev-xyz"'
    const deviceId: string | null = deviceIdRaw ? JSON.parse(deviceIdRaw) : null;
    const pending: number = parseInt(pendingRaw ?? '0', 10);

    if (!deviceId || pending <= 0) {
      return BackgroundTaskResult.Success;
    }

    const apiUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (!apiUrl) return BackgroundTaskResult.Failed;

    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${apiUrl}/api/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        date: today,
        steps: pending,
        mode: 'increment',
        source: 'phone',
      }),
    });

    if (res.ok) {
      await AsyncStorage.setItem('bg_pending_steps', '0');
      return BackgroundTaskResult.Success;
    }
    return BackgroundTaskResult.Failed;
  } catch {
    return BackgroundTaskResult.Failed;
  }
});
