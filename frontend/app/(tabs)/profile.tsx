import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, fonts } from "@/src/theme";
import { apiGet, apiPost, getDeviceId, Profile } from "@/src/api";

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
  { key: "heart_condition", label: "Heart" },
  { key: "joint_pain", label: "Joint Pain" },
  { key: "asthma", label: "Asthma" },
  { key: "hypertension", label: "Hypertension" },
  { key: "diabetes", label: "Diabetes" },
  { key: "back_pain", label: "Back Pain" },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [gender, setGender] = useState("male");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [activity, setActivity] = useState("moderate");
  const [conditions, setConditions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const deviceId = await getDeviceId();
      const p = await apiGet<Profile>(`/profile/${deviceId}`);
      setProfile(p);
      setName(p.name);
      setGender(p.gender);
      setAge(String(p.age));
      setWeight(String(p.weight_kg));
      setHeight(String(p.height_cm));
      setActivity(p.activity_level);
      setConditions(p.health_conditions ?? []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  function toggleCondition(key: string) {
    setConditions((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    );
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert("Error", "Name is required."); return; }
    const ageNum = parseInt(age, 10);
    const wNum = parseFloat(weight);
    const hNum = parseFloat(height);
    if (!ageNum || ageNum < 5 || ageNum > 110) { Alert.alert("Error", "Enter a valid age (5–110)."); return; }
    if (!wNum || wNum < 20) { Alert.alert("Error", "Enter a valid weight."); return; }
    if (!hNum || hNum < 80) { Alert.alert("Error", "Enter a valid height."); return; }

    setSaving(true);
    setSavedOk(false);
    try {
      const deviceId = await getDeviceId();
      const updated = await apiPost<Profile>("/profile", {
        device_id: deviceId,
        name: name.trim(),
        gender,
        age: ageNum,
        weight_kg: wNum,
        height_cm: hNum,
        activity_level: activity,
        health_conditions: conditions,
      });
      setProfile(updated);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[s.loadingBox, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
        bottomOffset={16}
      >
        {/* Profile Avatar + Name */}
        <View style={s.avatarRow}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>
              {name.charAt(0).toUpperCase() || "?"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.profileName}>{profile?.name || "Your Profile"}</Text>
            <Text style={s.profileSub}>Member since Day 1</Text>
          </View>
        </View>

        {/* Calculated Goals */}
        {profile && (
          <View style={s.goalsCard}>
            <View style={s.goalItem}>
              <Ionicons name="footsteps" size={13} color={colors.brand} />
              <Text style={s.goalLbl}>STEP GOAL</Text>
              <Text style={s.goalVal}>
                {profile.step_goal.toLocaleString()}
              </Text>
            </View>
            <View style={s.goalDiv} />
            <View style={s.goalItem}>
              <Ionicons name="flame" size={13} color={colors.warning} />
              <Text style={s.goalLbl}>CALORIE BURN</Text>
              <Text style={s.goalVal}>{profile.calorie_goal} kcal</Text>
            </View>
            <View style={s.goalDiv} />
            <View style={s.goalItem}>
              <Ionicons name="pulse" size={13} color={colors.success} />
              <Text style={s.goalLbl}>BASE BMR</Text>
              <Text style={s.goalVal}>{profile.bmr} kcal</Text>
            </View>
          </View>
        )}

        <Text style={s.sectionTitle}>PERSONAL INFO</Text>

        {/* Name */}
        <View style={s.field}>
          <Text style={s.label}>NAME</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.onSurfaceSecondary}
            autoCapitalize="words"
            testID="profile-name"
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
              >
                <Text style={[s.pillTxt, gender === g.key && s.pillTxtOn]}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Age + Weight */}
        <View style={s.row2}>
          <View style={[s.field, { flex: 1, marginRight: 8 }]}>
            <Text style={s.label}>AGE</Text>
            <TextInput
              style={s.input}
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
              placeholder="25"
              placeholderTextColor={colors.onSurfaceSecondary}
              testID="profile-age"
            />
          </View>
          <View style={[s.field, { flex: 1, marginLeft: 8 }]}>
            <Text style={s.label}>WEIGHT (KG)</Text>
            <TextInput
              style={s.input}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="70"
              placeholderTextColor={colors.onSurfaceSecondary}
              testID="profile-weight"
            />
          </View>
        </View>

        {/* Height */}
        <View style={s.field}>
          <Text style={s.label}>HEIGHT (CM)</Text>
          <TextInput
            style={s.input}
            value={height}
            onChangeText={setHeight}
            keyboardType="decimal-pad"
            placeholder="170"
            placeholderTextColor={colors.onSurfaceSecondary}
            testID="profile-height"
          />
        </View>

        <Text style={[s.sectionTitle, { marginTop: 4 }]}>FITNESS</Text>

        {/* Activity Level */}
        <View style={s.field}>
          <Text style={s.label}>ACTIVITY LEVEL</Text>
          <View style={s.pillGrid}>
            {ACTIVITY_LEVELS.map((a) => (
              <TouchableOpacity
                key={a.key}
                style={[s.pill, s.pillMd, activity === a.key && s.pillOn]}
                onPress={() => setActivity(a.key)}
              >
                <Text style={[s.pillTxt, activity === a.key && s.pillTxtOn]}>
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Health Conditions */}
        <View style={s.field}>
          <Text style={s.label}>HEALTH CONDITIONS</Text>
          <View style={s.pillGrid}>
            {HEALTH_CONDITIONS.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={[s.pill, s.pillMd, conditions.includes(c.key) && s.pillOn]}
                onPress={() => toggleCondition(c.key)}
              >
                {conditions.includes(c.key) && (
                  <Ionicons
                    name="checkmark"
                    size={11}
                    color={colors.onBrand}
                    style={{ marginRight: 4 }}
                  />
                )}
                <Text
                  style={[
                    s.pillTxt,
                    conditions.includes(c.key) && s.pillTxtOn,
                  ]}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[
            s.saveBtn,
            saving && { opacity: 0.6 },
            savedOk && s.saveBtnOk,
          ]}
          onPress={handleSave}
          disabled={saving}
          testID="save-profile"
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <View style={s.saveBtnInner}>
              {savedOk && (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.onBrand}
                  style={{ marginRight: 8 }}
                />
              )}
              <Text style={s.saveBtnTxt}>
                {savedOk ? "Goals Updated!" : "Save Profile"}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={s.infoTxt}>
          Saving recalculates your daily step and calorie goals based on your
          updated biometrics.
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loadingBox: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 24 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 24 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandTertiary,
    borderWidth: 2,
    borderColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { fontFamily: fonts.display, fontSize: 28, color: colors.brand },
  profileName: { fontFamily: fonts.textBold, fontSize: 22, color: colors.onSurface },
  profileSub: {
    fontFamily: fonts.text,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    marginTop: 2,
  },
  goalsCard: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 28,
    overflow: "hidden",
  },
  goalItem: { flex: 1, padding: 14, alignItems: "center", gap: 4 },
  goalDiv: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  goalLbl: {
    fontFamily: fonts.textBold,
    fontSize: 9,
    color: colors.onSurfaceSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  goalVal: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.onSurface,
    textAlign: "center",
  },
  sectionTitle: {
    fontFamily: fonts.textBold,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  field: { marginBottom: 20 },
  row2: { flexDirection: "row" },
  label: {
    fontFamily: fonts.textBold,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    letterSpacing: 1,
    marginBottom: 8,
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
  pillMd: { paddingHorizontal: 14 },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillTxt: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceSecondary },
  pillTxtOn: { color: colors.onBrand, fontFamily: fonts.textBold },
  saveBtn: {
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  saveBtnOk: { backgroundColor: colors.success },
  saveBtnInner: { flexDirection: "row", alignItems: "center" },
  saveBtnTxt: { fontFamily: fonts.display, fontSize: 20, color: colors.onBrand, letterSpacing: 0.5 },
  infoTxt: {
    fontFamily: fonts.text,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: 14,
    lineHeight: 18,
  },
});
