import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

// On web (browser), use a relative /api path — same-origin request, no CORS.
// On native (Expo Go / iOS / Android), use the full backend URL from env.
export const API_URL =
  Platform.OS === "web"
    ? "/api"
    : `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

let cachedDeviceId: string | null = null;
let profileSyncPromise: Promise<Profile | null> | null = null;
const PROFILE_CACHE_KEY = "profile_cache";
const PENDING_PROFILE_KEY = "pending_profile_sync";

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

export interface ProfileInput {
  device_id: string;
  name: string;
  age: number;
  gender: string;
  weight_kg: number;
  height_cm: number;
  activity_level: string;
  health_conditions: string[];
}

const ACTIVITY_FACTORS: Record<string, number> = {
  sedentary: 0.8,
  light: 0.9,
  moderate: 1,
  active: 1.15,
  athlete: 1.3,
};

const CONDITION_FACTORS: Record<string, number> = {
  heart_condition: 0.8,
  joint_pain: 0.85,
  asthma: 0.9,
  hypertension: 0.95,
  diabetes: 1.05,
  back_pain: 0.9,
};

export function buildLocalProfile(input: ProfileInput): Profile {
  const base = input.age < 30 ? 10000 : input.age <= 45 ? 9000 : input.age <= 60 ? 8000 : 6500;
  const conditionFactor = input.health_conditions.reduce(
    (factor, condition) => factor * (CONDITION_FACTORS[condition] ?? 1),
    1,
  );
  const rawGoal = base * (ACTIVITY_FACTORS[input.activity_level] ?? 1) * conditionFactor;
  const stepGoal = Math.round(Math.max(3000, Math.min(20000, rawGoal)) / 250) * 250;
  const genderOffset = input.gender === "male" ? 5 : input.gender === "female" ? -161 : -78;
  const bmr = Math.trunc(10 * input.weight_kg + 6.25 * input.height_cm - 5 * input.age + genderOffset);

  return {
    ...input,
    step_goal: stepGoal,
    calorie_goal: Math.round(stepGoal * 0.00057 * input.weight_kg),
    bmr,
  };
}

async function cacheProfile(profile: Profile): Promise<void> {
  await storage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
}

export async function getCachedProfile(deviceId?: string): Promise<Profile | null> {
  const raw = await storage.getItem<string>(PROFILE_CACHE_KEY, "");
  if (!raw) return null;
  try {
    const profile = JSON.parse(raw) as Profile;
    return !deviceId || profile.device_id === deviceId ? profile : null;
  } catch {
    return null;
  }
}

export async function saveProfileLocally(input: ProfileInput): Promise<Profile> {
  const profile = buildLocalProfile(input);
  await Promise.all([
    cacheProfile(profile),
    storage.setItem(PENDING_PROFILE_KEY, JSON.stringify(input)),
  ]);
  return profile;
}

async function performProfileSync(): Promise<Profile | null> {
  const raw = await storage.getItem<string>(PENDING_PROFILE_KEY, "");
  if (!raw) return null;
  const input = JSON.parse(raw) as ProfileInput;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const saved = await apiPost<Profile>("/profile", input, controller.signal);
    await Promise.all([cacheProfile(saved), storage.removeItem(PENDING_PROFILE_KEY)]);
    return saved;
  } finally {
    clearTimeout(timer);
  }
}

export function syncPendingProfile(): Promise<Profile | null> {
  if (!profileSyncPromise) {
    profileSyncPromise = performProfileSync().finally(() => {
      profileSyncPromise = null;
    });
  }
  return profileSyncPromise;
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
