import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
  Alert,
  AppState,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import ProgressRing from "@/src/components/ProgressRing";
import { usePedometer } from "@/src/hooks/usePedometer";
import { useBLEContext } from "@/src/context/BLEContext";
import { colors, radius, fonts } from "@/src/theme";
import { apiGet, apiPost, getDeviceId, todayStr, Profile, DayMetrics } from "@/src/api";

interface AchieveSummary {
  current_streak: number;
  best_streak: number;
  total_steps: number;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

function getDateLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const HEADER_H = insets.top + 64;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [localSteps, setLocalSteps] = useState(0);
  const [achieve, setAchieve] = useState<AchieveSummary>({
    current_streak: 0,
    best_streak: 0,
    total_steps: 0,
  });
  const [aiTip, setAiTip] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPermExplainer, setShowPermExplainer] = useState(false);

  const deviceIdRef = useRef("");
  const pendingRef = useRef(0);
  const goalRef = useRef(10000);
  const goalCelebrated = useRef(false);
  const lastSyncedBLEStepsRef = useRef(0);
  const bleStepsRef = useRef(0);

  // BLE context
  const {
    bleSteps, heartRate, connectedDevice, stepSource, setStepSource,
  } = useBLEContext();

  // Keep bleStepsRef in sync (avoids stale closure in syncBLESteps)
  bleStepsRef.current = bleSteps;

  // ─── Pedometer ───────────────────────────────────────────────────────
  const onDelta = useCallback((delta: number) => {
    pendingRef.current += delta;
    setLocalSteps((prev) => {
      const next = prev + delta;
      const currentGoal = goalRef.current;
      // Fire goal celebration haptic exactly once per day when goal is first crossed
      if (!goalCelebrated.current && next >= currentGoal && currentGoal > 0) {
        goalCelebrated.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      return next;
    });
  }, []); // refs are stable — no deps needed

  const { available, permission, requestPermission } = usePedometer(onDelta);

  // ─── Computed display values ──────────────────────────────────────────
  const weight = profile?.weight_kg ?? 70;
  const heightCm = profile?.height_cm ?? 170;
  const goal = profile?.step_goal ?? 10000;

  // Which step count to show depends on selected source
  const displaySteps = stepSource === "ble" ? bleSteps : localSteps;
  const progress = Math.min(1, displaySteps / Math.max(goal, 1));
  const calories = Math.round(displaySteps * 0.00057 * weight);
  const distanceKm = (displaySteps * heightCm * 0.00415 / 1000).toFixed(2);
  const activeMin = Math.floor(displaySteps / 110);

  // ─── Load data ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const deviceId = await getDeviceId();
      deviceIdRef.current = deviceId;
      const today = todayStr();
      const [pRes, mRes, aRes] = await Promise.allSettled([
        apiGet<Profile>(`/profile/${deviceId}`),
        apiGet<DayMetrics>(`/steps/${deviceId}/day/${today}`),
        apiGet<AchieveSummary>(`/achievements/${deviceId}`),
      ]);
      if (pRes.status === "fulfilled") {
        setProfile(pRes.value);
        goalRef.current = pRes.value.step_goal ?? 10000;
      }
      if (mRes.status === "fulfilled") {
        const apiSteps = mRes.value.steps;
        const apiGoal = goalRef.current;
        setLocalSteps(apiSteps);
        pendingRef.current = 0;
        // If goal was already met before app opened, mark celebrated to prevent spurious haptic
        goalCelebrated.current = apiSteps >= apiGoal;
      }
      if (aRes.status === "fulfilled") setAchieve(aRes.value);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ─── Sync pending phone steps ─────────────────────────────────────────
  const syncPending = useCallback(async () => {
    if (pendingRef.current <= 0 || !deviceIdRef.current) return;
    const toSync = pendingRef.current;
    pendingRef.current = 0;
    try {
      await apiPost("/steps", {
        device_id: deviceIdRef.current,
        date: todayStr(),
        steps: toSync,
        mode: "increment",
        source: "phone",
      });
    } catch {
      pendingRef.current += toSync;
    }
  }, []);

  // ─── Sync BLE steps to backend ────────────────────────────────────────
  const syncBLESteps = useCallback(async () => {
    if (stepSource !== "ble" || !deviceIdRef.current) return;
    const current = bleStepsRef.current;
    if (current === 0 || current === lastSyncedBLEStepsRef.current) return;
    lastSyncedBLEStepsRef.current = current;
    try {
      await apiPost("/steps", {
        device_id: deviceIdRef.current,
        date: todayStr(),
        steps: current,
        mode: "set",
        source: "ble",
      });
    } catch {
      lastSyncedBLEStepsRef.current = 0; // retry next cycle
    }
  }, [stepSource]);

  // ─── AI Tips ──────────────────────────────────────────────────────────
  const FALLBACK_TIP =
    "Stay consistent — even 10 minutes of walking a day builds a lasting habit. Keep going! 🏃";

  const loadAiTip = useCallback(async (refresh = false) => {
    if (!deviceIdRef.current) return;
    setAiLoading(true);

    // Abort if the server takes longer than 8 seconds (prevents indefinite spinner)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await apiPost<{ tip: string }>("/ai/coach", {
        device_id: deviceIdRef.current,
        date: todayStr(),
        refresh,
      }, controller.signal);
      setAiTip(res.tip);
    } catch {
      // Show a friendly fallback so the section is never empty
      setAiTip((prev) => prev || FALLBACK_TIP);
    } finally {
      clearTimeout(timer);
      setAiLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (profile && deviceIdRef.current) loadAiTip();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.device_id]);

  useEffect(() => {
    const id = setInterval(() => {
      syncPending();
      syncBLESteps();
    }, 15_000);
    return () => clearInterval(id);
  }, [syncPending, syncBLESteps]);

  // ─── AppState: flush pending steps to AsyncStorage for background task ──
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        AsyncStorage.setItem("bg_pending_steps", String(pendingRef.current)).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const firstName = profile?.name?.split(" ")[0] ?? "Champ";
  const showPermBanner =
    available !== false &&
    permission !== "granted" &&
    permission !== "unknown";

  async function handleEnablePedo() {
    if (permission === "blocked") {
      Linking.openSettings();
      return;
    }
    if (permission === "undetermined") {
      // Show in-app explainer first (before triggering native dialog)
      setShowPermExplainer(true);
      return;
    }
    // "denied" with canAskAgain — directly request again
    await requestPermission();
  }

  async function confirmPermRequest() {
    setShowPermExplainer(false);
    await requestPermission();
  }

  // ─── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.loadingBox}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Scrollable content */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[
          s.scrollContent,
          { paddingTop: HEADER_H + 16, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            progressViewOffset={HEADER_H}
          />
        }
      >
        {/* Pre-permission Explainer (shown before native dialog) */}
        {showPermExplainer && (
          <View style={s.explainerCard}>
            <View style={s.explainerHeader}>
              <View style={s.explainerIconBg}>
                <Ionicons name="footsteps" size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.explainerTitle}>Enable Step Tracking</Text>
                <Text style={s.explainerBody}>
                  AeroStep uses your phone motion sensor to count steps in real time — no GPS, no battery drain.
                </Text>
              </View>
            </View>
            <View style={s.explainerActions}>
              <TouchableOpacity
                style={s.explainerSkip}
                onPress={() => setShowPermExplainer(false)}
              >
                <Text style={s.explainerSkipTxt}>Not Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.explainerConfirm}
                onPress={confirmPermRequest}
                testID="perm-confirm"
              >
                <Text style={s.explainerConfirmTxt}>Allow Tracking →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Compact Permission Banner (denied / blocked) */}
        {showPermBanner && !showPermExplainer && (
          <TouchableOpacity
            style={s.permBanner}
            onPress={handleEnablePedo}
            activeOpacity={0.8}
            testID="perm-banner"
          >
            <Ionicons name="footsteps" size={18} color={colors.brand} />
            <Text style={s.permText}>
              {permission === "blocked"
                ? "Open Settings to enable step tracking"
                : permission === "undetermined"
                ? "Tap to enable live step counting"
                : "Step tracking was denied — tap to retry"}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </TouchableOpacity>
        )}

        {/* Hero Ring */}
        <View style={s.hero}>
          <ProgressRing size={240} strokeWidth={16} progress={progress}>
            <View style={s.ringInner}>
              <Text style={s.stepCount} testID="step-count">
                {displaySteps.toLocaleString()}
              </Text>
              <Text style={s.stepGoal}>/ {goal.toLocaleString()}</Text>
              <Text style={s.stepLabel}>
                {stepSource === "ble" ? "BLE STEPS" : "STEPS TODAY"}
              </Text>
            </View>
          </ProgressRing>

          {/* Progress pill */}
          <View style={s.pctPill}>
            <Text style={s.pctValue}>{Math.round(progress * 100)}%</Text>
            <Text style={s.pctLabel}> of daily goal</Text>
          </View>

          {/* Source Toggle */}
          <View style={s.sourceToggle}>
            <TouchableOpacity
              style={[s.sourcePill, stepSource === "phone" && s.sourcePillOn]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStepSource("phone");
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="phone-portrait-outline"
                size={12}
                color={stepSource === "phone" ? colors.onBrand : colors.onSurfaceSecondary}
              />
              <Text style={[s.sourcePillTxt, stepSource === "phone" && s.sourcePillTxtOn]}>
                Phone
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.sourcePill, stepSource === "ble" && s.sourcePillOn]}
              onPress={async () => {
                if (!connectedDevice) {
                  Alert.alert(
                    "No BLE Device",
                    "Connect a fitness device first from Profile → Connected Devices.",
                    [{ text: "OK" }]
                  );
                  return;
                }
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                await setStepSource("ble");
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="bluetooth"
                size={12}
                color={stepSource === "ble" ? colors.onBrand : colors.onSurfaceSecondary}
              />
              <Text style={[s.sourcePillTxt, stepSource === "ble" && s.sourcePillTxtOn]}>
                BLE Device
              </Text>
              {connectedDevice && (
                <View style={[s.bleStatusDot, stepSource === "ble" && s.bleStatusDotOn]} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Heart Rate Band — shown when BLE device is connected */}
        {connectedDevice && heartRate && (
          <View style={s.hrBand}>
            <View style={s.hrLeft}>
              <View style={s.hrIconWrap}>
                <View style={s.hrLiveDot} />
                <Ionicons name="heart" size={18} color="#FF6B6B" />
              </View>
              <View>
                <Text style={s.hrValue}>
                  {heartRate}{" "}
                  <Text style={s.hrUnit}>BPM</Text>
                </Text>
                <Text style={s.hrLabel}>HEART RATE</Text>
              </View>
            </View>
            <View style={s.hrRight}>
              <View style={s.hrLiveBadge}>
                <Text style={s.hrLiveBadgeTxt}>● LIVE</Text>
              </View>
              <Text style={s.hrDevName} numberOfLines={1}>{connectedDevice.name}</Text>
            </View>
          </View>
        )}

        {/* Metric Grid */}
        <View style={s.grid}>
          <MetricCard
            icon="flame"
            color={colors.warning}
            label="Cals"
            value={calories.toString()}
            unit="kcal"
          />
          <MetricCard
            icon="map"
            color={colors.brand}
            label="Dist"
            value={distanceKm}
            unit="km"
          />
          <MetricCard
            icon="timer-outline"
            color={colors.success}
            label="Active"
            value={activeMin.toString()}
            unit="min"
          />
          <MetricCard
            icon="flame"
            color="#FF6B35"
            label="Streak"
            value={achieve.current_streak.toString()}
            unit="days"
          />
        </View>

        {/* AI Coach Card */}
        <View style={s.aiCard} testID="ai-card">
          <View style={s.aiHeader}>
            <View style={s.aiTitle}>
              <View style={s.aiDot} />
              <Text style={s.aiTitleTxt}>Daily Coach</Text>
            </View>
            <TouchableOpacity
              style={s.refreshBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                loadAiTip(true);
              }}
              disabled={aiLoading}
              testID="refresh-ai"
            >
              <Ionicons
                name="refresh"
                size={15}
                color={aiLoading ? colors.borderStrong : colors.brand}
              />
            </TouchableOpacity>
          </View>

          {aiLoading ? (
            <View style={s.aiLoading}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={s.aiLoadingTxt}>Getting your tips…</Text>
            </View>
          ) : aiTip ? (
            <Text style={s.aiTipTxt}>{aiTip}</Text>
          ) : (
            <Text style={s.aiEmptyTxt}>
              {profile ? "Tap \u21bb to get your personalized tips for today." : "Complete your profile to unlock personalized tips."}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Sticky Glass Header */}
      <BlurView
        style={[s.header, { height: HEADER_H }]}
        tint="dark"
        intensity={Platform.OS === "ios" ? 60 : 0}
        testID="home-header"
      >
        <View
          style={[
            s.headerInner,
            {
              paddingTop: insets.top + 8,
              backgroundColor:
                Platform.OS === "android" ? "rgba(10,10,12,0.97)" : "transparent",
            },
          ]}
        >
          <View>
            <Text style={s.greeting}>
              {getGreeting()}, {firstName} 👋
            </Text>
            <Text style={s.dateLabel}>{getDateLabel()}</Text>
          </View>
          <View style={s.streakPill}>
            <Ionicons name="flame" size={13} color={colors.warning} />
            <Text style={s.streakVal}>{achieve.current_streak}</Text>
          </View>
        </View>
      </BlurView>
    </View>
  );
}

// ─── Metric Card Component ────────────────────────────────────────────────────
function MetricCard({
  icon,
  color,
  label,
  value,
  unit,
}: {
  icon: any;
  color: string;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <View style={mc.card} testID={`metric-${label}`}>
      <View style={[mc.iconBg, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={mc.value}>{value}</Text>
      <Text style={mc.unit}>{unit}</Text>
      <Text style={mc.label} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const mc = StyleSheet.create({
  card: {
    flex: 1,
    margin: 5,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    minHeight: 112,
    justifyContent: "center",
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  value: { fontFamily: fonts.display, fontSize: 28, color: colors.onSurface, lineHeight: 30 },
  unit: { fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceSecondary },
  label: {
    fontFamily: fonts.text,
    fontSize: 10,
    color: colors.borderStrong,
    textTransform: "uppercase",
    marginTop: 4,
  },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loadingBox: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  greeting: { fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface },
  dateLabel: { fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakVal: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  permBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.brand + "40",
  },
  permText: { flex: 1, fontFamily: fonts.text, fontSize: 13, color: colors.brand },
  explainerCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brand + "50",
    padding: 16,
    marginBottom: 16,
  },
  explainerHeader: { flexDirection: "row", gap: 14, marginBottom: 16 },
  explainerIconBg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  explainerTitle: {
    fontFamily: fonts.textBold,
    fontSize: 15,
    color: colors.onSurface,
    marginBottom: 4,
  },
  explainerBody: {
    fontFamily: fonts.text,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    lineHeight: 18,
  },
  explainerActions: { flexDirection: "row", gap: 10 },
  explainerSkip: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  explainerSkipTxt: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
  },
  explainerConfirm: {
    flex: 2,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  explainerConfirmTxt: {
    fontFamily: fonts.textBold,
    fontSize: 14,
    color: colors.onBrand,
  },
  hero: { alignItems: "center", paddingVertical: 20 },
  ringInner: { alignItems: "center" },
  stepCount: {
    fontFamily: fonts.display,
    fontSize: 56,
    color: colors.onSurface,
    lineHeight: 60,
  },
  stepGoal: {
    fontFamily: fonts.text,
    fontSize: 15,
    color: colors.onSurfaceSecondary,
    marginTop: 2,
  },
  stepLabel: {
    fontFamily: fonts.textBold,
    fontSize: 10,
    color: colors.onSurfaceSecondary,
    letterSpacing: 1.5,
    marginTop: 4,
  },
  pctPill: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 16,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pctValue: { fontFamily: fonts.display, fontSize: 22, color: colors.brand },
  pctLabel: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceSecondary },

  // Source toggle
  sourceToggle: {
    flexDirection: "row",
    marginTop: 14,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  sourcePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  sourcePillOn: { backgroundColor: colors.brand },
  sourcePillTxt: { fontFamily: fonts.textBold, fontSize: 12, color: colors.onSurfaceSecondary },
  sourcePillTxtOn: { color: colors.onBrand },
  bleStatusDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: colors.success, opacity: 0.6,
  },
  bleStatusDotOn: { opacity: 1 },

  // Heart Rate Band
  hrBand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FF6B6B14",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#FF6B6B30",
    padding: 14,
    marginBottom: 12,
  },
  hrLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  hrIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "#FF6B6B22",
    alignItems: "center", justifyContent: "center",
  },
  hrLiveDot: {
    position: "absolute", top: -1, right: -1, zIndex: 1,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.success, borderWidth: 1.5, borderColor: colors.surface,
  },
  hrValue: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  hrUnit: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary },
  hrLabel: {
    fontFamily: fonts.textBold, fontSize: 9, color: colors.onSurfaceSecondary,
    letterSpacing: 1.2, marginTop: 2,
  },
  hrRight: { alignItems: "flex-end", gap: 4 },
  hrLiveBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: colors.success + "22",
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.success + "40",
  },
  hrLiveBadgeTxt: {
    fontFamily: fonts.textBold, fontSize: 10, color: colors.success, letterSpacing: 0.5,
  },
  hrDevName: {
    fontFamily: fonts.text, fontSize: 11, color: colors.onSurfaceSecondary, maxWidth: 120,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, marginBottom: 16 },
  aiCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  aiHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  aiTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  aiTitleTxt: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  refreshBtn: { padding: 6 },
  aiLoading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  aiLoadingTxt: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary },
  aiTipTxt: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: colors.onSurfaceTertiary,
    lineHeight: 22,
  },
  aiEmptyTxt: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
    fontStyle: "italic",
  },
});
