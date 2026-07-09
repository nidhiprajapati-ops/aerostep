import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, radius, fonts } from "@/src/theme";
import { apiGet, getDeviceId, todayStr } from "@/src/api";

interface Badge {
  id: string;
  name: string;
  desc: string;
  icon: string;
  unlocked: boolean;
}

interface AchievementsData {
  current_streak: number;
  best_streak: number;
  total_steps: number;
  unlocked_count: number;
  badges: Badge[];
}

const ICON_MAP: Record<string, any> = {
  footsteps: "footsteps",
  "hand-left": "hand-left-outline",
  ribbon: "ribbon",
  flash: "flash",
  rocket: "rocket",
  flame: "flame",
  bonfire: "bonfire",
  map: "map",
  trophy: "trophy",
};

const STREAK_IMAGE =
  "https://images.unsplash.com/photo-1778617845027-233ec9629ac9?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85&w=800";

export default function AwardsScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<AchievementsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAchievements = useCallback(async () => {
    try {
      const deviceId = await getDeviceId();
      const today = todayStr();
      const res = await apiGet<AchievementsData>(
        `/achievements/${deviceId}?date=${today}`
      );
      setData(res);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAchievements(); }, [loadAchievements]);

  const onRefresh = () => { setRefreshing(true); loadAchievements(); };

  function handleBadgeTap(badge: Badge) {
    if (badge.unlocked) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  // Build 3-column badge rows
  const badges = data?.badges ?? [];
  const rows: Badge[][] = [];
  for (let i = 0; i < badges.length; i += 3) {
    rows.push(badges.slice(i, i + 3));
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <Text style={s.title}>Achievements</Text>
        {data && (
          <View style={s.countPill}>
            <Text style={s.countTxt}>
              {data.unlocked_count}/{data.badges.length}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
          />
        }
      >
        {loading ? (
          <View style={s.loadBox}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <>
            {/* Streak Featured Card */}
            <View style={s.streakCard}>
              <Image
                source={{ uri: STREAK_IMAGE }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              <LinearGradient
                colors={["transparent", "rgba(10,10,12,0.92)"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={s.streakContent}>
                <Text style={s.streakLabel}>CURRENT STREAK</Text>
                <View style={s.streakRow}>
                  <Ionicons name="flame" size={34} color={colors.warning} />
                  <Text style={s.streakNum}>{data?.current_streak ?? 0}</Text>
                  <Text style={s.streakUnit}>days</Text>
                </View>
                <Text style={s.streakBest}>
                  Personal best: {data?.best_streak ?? 0} days
                </Text>
              </View>
            </View>

            {/* Total steps pill */}
            <View style={s.totalRow}>
              <View style={s.totalCard}>
                <Ionicons name="footsteps" size={15} color={colors.brand} />
                <View>
                  <Text style={s.totalLabel}>LIFETIME STEPS</Text>
                  <Text style={s.totalVal}>
                    {(data?.total_steps ?? 0).toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Badges */}
            <Text style={s.sectionTitle}>BADGES</Text>
            {rows.length === 0 ? (
              <View style={s.emptyBadges}>
                <Ionicons name="trophy-outline" size={40} color={colors.borderStrong} />
                <Text style={s.emptyTxt}>
                  Walk 10,000 steps to unlock your first badge!
                </Text>
              </View>
            ) : (
              rows.map((row, ri) => (
                <View key={ri} style={s.badgeRow}>
                  {row.map((badge) => (
                    <TouchableOpacity
                      key={badge.id}
                      style={[
                        s.badge,
                        !badge.unlocked && s.badgeDimmed,
                      ]}
                      onPress={() => handleBadgeTap(badge)}
                      activeOpacity={badge.unlocked ? 0.75 : 0.95}
                      testID={`badge-${badge.id}`}
                    >
                      <View
                        style={[
                          s.badgeIcon,
                          badge.unlocked && s.badgeIconOn,
                        ]}
                      >
                        <Ionicons
                          name={ICON_MAP[badge.icon] ?? "star"}
                          size={22}
                          color={badge.unlocked ? colors.onBrand : colors.borderStrong}
                        />
                      </View>
                      <Text
                        style={[
                          s.badgeName,
                          badge.unlocked && s.badgeNameOn,
                        ]}
                        numberOfLines={2}
                      >
                        {badge.name}
                      </Text>
                      {badge.unlocked ? (
                        <View style={s.checkMark}>
                          <Ionicons name="checkmark" size={9} color={colors.onBrand} />
                        </View>
                      ) : (
                        <Ionicons
                          name="lock-closed"
                          size={11}
                          color={colors.borderStrong}
                          style={{ marginTop: 4 }}
                        />
                      )}
                      <Text style={s.badgeDesc} numberOfLines={2}>
                        {badge.desc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {/* Fill empty grid slots */}
                  {row.length < 3 &&
                    Array.from({ length: 3 - row.length }).map((_, j) => (
                      <View key={`ph-${j}`} style={s.badgePlaceholder} />
                    ))}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.display, fontSize: 34, color: colors.onSurface, letterSpacing: 0.5 },
  countPill: {
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.brand + "40",
  },
  countTxt: { fontFamily: fonts.textBold, fontSize: 12, color: colors.brand },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  loadBox: { height: 200, alignItems: "center", justifyContent: "center" },
  streakCard: {
    height: 168,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: 12,
    justifyContent: "flex-end",
  },
  streakContent: { padding: 20 },
  streakLabel: {
    fontFamily: fonts.textBold,
    fontSize: 10,
    color: colors.onSurfaceSecondary,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  streakRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 4 },
  streakNum: {
    fontFamily: fonts.display,
    fontSize: 54,
    color: colors.onSurface,
    lineHeight: 58,
  },
  streakUnit: { fontFamily: fonts.text, fontSize: 18, color: colors.onSurfaceSecondary },
  streakBest: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary },
  totalRow: { marginBottom: 20 },
  totalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
  },
  totalLabel: {
    fontFamily: fonts.textBold,
    fontSize: 10,
    color: colors.onSurfaceSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  totalVal: { fontFamily: fonts.display, fontSize: 28, color: colors.onSurface },
  sectionTitle: {
    fontFamily: fonts.textBold,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  emptyBadges: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 14,
  },
  emptyTxt: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  badgeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  badge: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    alignItems: "center",
    minHeight: 130,
  },
  badgeDimmed: { opacity: 0.5 },
  badgeIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  badgeIconOn: { backgroundColor: colors.brand },
  badgeName: {
    fontFamily: fonts.textBold,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginBottom: 4,
  },
  badgeNameOn: { color: colors.onSurface },
  checkMark: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  badgeDesc: {
    fontFamily: fonts.text,
    fontSize: 9,
    color: colors.borderStrong,
    textAlign: "center",
    lineHeight: 13,
    marginTop: 2,
  },
  badgePlaceholder: { flex: 1 },
});
