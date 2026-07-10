import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, fonts } from "@/src/theme";
import { apiPost, apiGet, getDeviceId } from "@/src/api";
import { storage } from "@/src/utils/storage";

const GENDERS = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "other", label: "Other" },
];

const ACTIVITY_LEVELS = [
  { key: "sedentary", label: "Sedentary" },
  { key: "light", label: "Light" },
  { key: "moderate", label: "Moderate" },
  { key: "active", label: "Active" },
  { key: "athlete", label: "Athlete" },
];

const HEALTH_CONDITIONS = [
  { key: "heart_condition", label: "Heart Condition" },
  { key: "joint_pain", label: "Joint Pain" },
  { key: "asthma", label: "Asthma" },
  { key: "hypertension", label: "Hypertension" },
  { key: "diabetes", label: "Diabetes" },
  { key: "back_pain", label: "Back Pain" },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [name, setName] = useState("");
  const [gender, setGender] = useState("male");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [activity, setActivity] = useState("moderate");
  const [conditions, setConditions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deviceIdRef = useRef("");

  // Pre-warm the HTTPS connection so the first real request (POST /profile)
  // doesn't pay the TLS-handshake tax (~1-3s on mobile cold start).
  useEffect(() => {
    apiGet("/health").catch(() => {});
    getDeviceId().then((id) => { deviceIdRef.current = id; }).catch(() => {});
  }, []);

  function toggleCondition(key: string) {
    setConditions((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    );
  }

  async function handleSubmit() {
    if (!name.trim()) { setError("Please enter your name"); return; }
    const ageNum = parseInt(age, 10);
    const weightNum = parseFloat(weight);
    const heightNum = parseFloat(height);
    if (!ageNum || ageNum < 5 || ageNum > 110) { setError("Enter a valid age (5–110)"); return; }
    if (!weightNum || weightNum < 20) { setError("Enter a valid weight in kg"); return; }
    if (!heightNum || heightNum < 80) { setError("Enter a valid height in cm"); return; }
    setError(null);
    setSaving(true);
    try {
      const deviceId = deviceIdRef.current || await getDeviceId();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        await apiPost("/profile", {
        device_id: deviceId,
        name: name.trim(),
        gender,
        age: ageNum,
        weight_kg: weightNum,
        height_cm: heightNum,
        activity_level: activity,
          health_conditions: conditions,
        }, controller.signal);
      } finally {
        clearTimeout(timer);
      }
      await storage.setItem("profile_complete", true);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      const timedOut = e?.name === "AbortError";
      setError(timedOut ? "Saving timed out. Check your connection and try again." : e.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.bg}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={s.bg}
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 48 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
      {/* Logo */}
      <View style={s.logoBlock}>
        <Text style={s.logo}>AEROSTEP</Text>
        <Text style={s.tagline}>Your personal fitness coach</Text>
      </View>

      {/* Name */}
      <View style={s.field}>
        <Text style={s.label}>YOUR NAME</Text>
        <TextInput
          style={s.input}
          placeholder="e.g. Alex"
          placeholderTextColor={colors.onSurfaceSecondary}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="done"
          testID="name-input"
        />
      </View>

      {/* Gender */}
      <View style={s.field}>
        <Text style={s.label}>GENDER</Text>
        <View style={s.pillRow}>
          {GENDERS.map((g) => (
            <TouchableOpacity
              key={g.key}
              style={[s.pill, gender === g.key && s.pillOn]}
              onPress={() => setGender(g.key)}
              testID={`gender-${g.key}`}
            >
              <Text style={[s.pillTxt, gender === g.key && s.pillTxtOn]}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Age */}
      <View style={s.field}>
        <Text style={s.label}>AGE</Text>
        <TextInput
          style={s.input}
          placeholder="25"
          placeholderTextColor={colors.onSurfaceSecondary}
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
          testID="age-input"
        />
      </View>

      {/* Weight + Height */}
      <View style={s.row2}>
        <View style={[s.field, { flex: 1, marginRight: 8 }]}>
          <Text style={s.label}>WEIGHT (KG)</Text>
          <TextInput
            style={s.input}
            placeholder="70"
            placeholderTextColor={colors.onSurfaceSecondary}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            testID="weight-input"
          />
        </View>
        <View style={[s.field, { flex: 1, marginLeft: 8 }]}>
          <Text style={s.label}>HEIGHT (CM)</Text>
          <TextInput
            style={s.input}
            placeholder="170"
            placeholderTextColor={colors.onSurfaceSecondary}
            value={height}
            onChangeText={setHeight}
            keyboardType="decimal-pad"
            testID="height-input"
          />
        </View>
      </View>

      {/* Activity Level */}
      <View style={s.field}>
        <Text style={s.label}>ACTIVITY LEVEL</Text>
        <View style={s.pillGrid}>
          {ACTIVITY_LEVELS.map((a) => (
            <TouchableOpacity
              key={a.key}
              style={[s.pill, s.pillMd, activity === a.key && s.pillOn]}
              onPress={() => setActivity(a.key)}
              testID={`activity-${a.key}`}
            >
              <Text style={[s.pillTxt, activity === a.key && s.pillTxtOn]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Health Conditions */}
      <View style={s.field}>
        <Text style={s.label}>
          HEALTH CONDITIONS{" "}
          <Text style={s.optional}>(optional)</Text>
        </Text>
        <View style={s.pillGrid}>
          {HEALTH_CONDITIONS.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[s.pill, s.pillMd, conditions.includes(c.key) && s.pillOn]}
              onPress={() => toggleCondition(c.key)}
              testID={`cond-${c.key}`}
            >
              {conditions.includes(c.key) && (
                <Ionicons
                  name="checkmark"
                  size={12}
                  color={colors.onBrand}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text style={[s.pillTxt, conditions.includes(c.key) && s.pillTxtOn]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tip box */}
      <View style={s.tipBox}>
        <Ionicons name="information-circle-outline" size={16} color={colors.brand} />
        <Text style={s.tipTxt}>
          Your goals are calculated from your profile and adjust for health conditions.
        </Text>
      </View>

      {/* Error */}
      {error ? <Text style={s.error} testID="profile-save-error">{error}</Text> : null}

      {/* CTA */}
      <TouchableOpacity
        style={[s.cta, saving && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={saving}
        testID="submit-btn"
        activeOpacity={0.85}
      >
        {saving ? (
          <View style={s.savingRow} testID="profile-saving-status">
            <ActivityIndicator color={colors.onBrand} />
            <Text style={s.savingTxt}>Saving…</Text>
          </View>
        ) : (
          <Text style={s.ctaTxt}>Create My Profile →</Text>
        )}
      </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 24 },
  logoBlock: { alignItems: "center", marginBottom: 40 },
  logo: {
    fontFamily: fonts.display,
    fontSize: 52,
    color: colors.brand,
    letterSpacing: 5,
  },
  tagline: {
    fontFamily: fonts.text,
    fontSize: 15,
    color: colors.onSurfaceSecondary,
    marginTop: 8,
  },
  field: { marginBottom: 20 },
  row2: { flexDirection: "row" },
  label: {
    fontFamily: fonts.textBold,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    letterSpacing: 1,
    marginBottom: 10,
  },
  optional: {
    fontFamily: fonts.text,
    fontSize: 11,
    color: colors.borderStrong,
    textTransform: "none",
  },
  input: {
    height: 52,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    fontFamily: fonts.text,
    fontSize: 15,
    color: colors.onSurface,
  },
  pillRow: { flexDirection: "row", gap: 8 },
  pillGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillMd: { paddingHorizontal: 16 },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillTxt: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceSecondary },
  pillTxtOn: { color: colors.onBrand, fontFamily: fonts.textBold },
  tipBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.brand + "30",
  },
  tipTxt: { flex: 1, fontFamily: fonts.text, fontSize: 13, color: colors.brand, lineHeight: 18 },
  error: {
    fontFamily: fonts.text,
    fontSize: 13,
    color: colors.error,
    marginBottom: 16,
    textAlign: "center",
  },
  cta: {
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaTxt: { fontFamily: fonts.display, fontSize: 20, color: colors.onBrand, letterSpacing: 1 },
  savingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  savingTxt: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onBrand },
});
