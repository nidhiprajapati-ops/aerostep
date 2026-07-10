import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

// On web (browser), use a relative /api path — same-origin request, no CORS.
// On native (Expo Go / iOS / Android), use the full backend URL from env.
export const API_URL =
  Platform.OS === "web"
    ? "/api"
    : `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  let id = await storage.getItem<string>("device_id", "");
  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await storage.setItem("device_id", id);
  }
  cachedDeviceId = id;
  return id;
}

export function todayStr(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost<T = any>(path: string, body: any, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `POST ${path} failed: ${res.status}`);
  }
  return res.json();
}

export interface Profile {
  device_id: string;
  name: string;
  age: number;
  gender: string;
  weight_kg: number;
  height_cm: number;
  activity_level: string;
  health_conditions: string[];
  step_goal: number;
  calorie_goal: number;
  bmr: number;
}

export interface DayMetrics {
  date: string;
  steps: number;
  goal: number;
  progress: number;
  calories: number;
  calorie_goal: number;
  distance_km: number;
  active_minutes: number;
}
