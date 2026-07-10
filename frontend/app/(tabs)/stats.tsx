import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, G, Text as SvgText, Line } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, fonts } from "@/src/theme";
import { apiGet, getDeviceId } from "@/src/api";

// ─── BLE accent colour (not in theme; used only for this screen) ─────────────
const BLE_COLOR = "#60A5FA";

interface HistoryDay {
  date: string;
  steps: number;
  steps_phone: number;
  steps_ble: number;
  met_goal: boolean;
}

interface HistorySummary {
  total_steps: number;
  avg_steps: number;
  best_day: { date: string; steps: number } | null;
  goal_met_days: number;
  total_distance_km: number;
  total_calories: number;
}

interface HistoryResponse {
  days: HistoryDay[];
  summary: HistorySummary;
}

type Period = 7 | 30;
type SourceView = "all" | "phone" | "ble";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stepsForView(day: HistoryDay, sv: SourceView): number {
  if (sv === "phone") return day.steps_phone ?? 0;
  if (sv === "ble") return day.steps_ble ?? 0;
  return day.steps;
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────
function BarChart({
  data,
  goal,
  width,
  sourceView,
}: {
  data: HistoryDay[];
  goal: number;
  width: number;
  sourceView: SourceView;
}) {
  if (!data.length) return null;
  const PAD = { l: 8, r: 8, t: 12, b: 26 };
  const innerH = 128;
  const totalH = innerH + PAD.t + PAD.b;
  const innerW = width - PAD.l - PAD.r;
  const barW = innerW / data.length;
  const barGap = data.length > 14 ? 2 : 5;

  const values = data.map((d) => stepsForView(d, sourceView));
  const maxVal = Math.max(goal, ...values, 1);
  const goalFrac = goal / maxVal;
  const goalY = PAD.t + innerH * (1 - goalFrac);

  const barColor = (val: number, metGoal: boolean) => {
    if (sourceView === "ble") return val > 0 ? BLE_COLOR : colors.surfaceTertiary;
    return metGoal ? colors.brand : colors.surfaceTertiary;
  };

  return (
    <Svg width={width} height={totalH}>
      {/* Goal dashed line */}
      <Line
        x1={PAD.l} y1={goalY} x2={width - PAD.r} y2={goalY}
        stroke={colors.brand} strokeWidth={1} strokeDasharray="5,3" opacity={0.6}
      />
      {data.map((day, i) => {
        const val = values[i];
        const bH = Math.max(3, (val / maxVal) * innerH);
        const bW = Math.max(3, barW - barGap);
        const x = PAD.l + i * barW + barGap / 2;
        const y = PAD.t + innerH - bH;
        const metGoal = val >= goal;
        const dayNum = day.date.slice(8);

        return (
          <G key={day.date}>
            <Rect
              x={x} y={y} width={bW} height={bH} rx={3}
              fill={barColor(val, metGoal)}
              opacity={val === 0 ? 0.3 : 1}
            />
            {data.length <= 14 && (
              <SvgText
                x={x + bW / 2} y={totalH - 6}
                textAnchor="middle"
                fill={colors.onSurfaceSecondary}
                fontSize={9}
              >
                {dayNum}
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
}

// ─── Summary Card ────────────────────────────────────────────────────────────
function SummaryCard({
  icon,
  color,
  label,
  value,
}: {
  icon: any;
  color: string;
  label: string;
  value: string;
}) {
  return (
    <View style={sc.card} testID={`stat-${label}`}>
      <Ionicons name={icon} size={15} color={color} style={{ marginBottom: 8 }} />
      <Text style={sc.val}>{value}</Text>
      <Text style={sc.lbl}>{label}</Text>
    </View>
  );
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const chartW = screenW - 56;

  const [period, setPeriod] = useState<Period>(7);
  const [sourceView, setSourceView] = useState<SourceView>("all");
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [goal, setGoal] = useState(10000);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async (p: Period, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const [hRes, pRes] = await Promise.allSettled([
        apiGet<HistoryResponse>(`/steps/${deviceId}/history?days=${p}`),
        apiGet<{ step_goal: number }>(`/profile/${deviceId}`),
      ]);
      if (hRes.status === "fulfilled") setHistory(hRes.value);
      if (pRes.status === "fulfilled") setGoal(pRes.value.step_goal ?? 10000);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadHistory(period); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function switchPeriod(p: Period) {
    setPeriod(p);
    loadHistory(p);
  }

  const onRefresh = () => { setRefreshing(true); loadHistory(period, true); };

  // ─── Source-filtered summary ─────────────────────────────────────────────
  const filteredSummary = (() => {
    const days = history?.days ?? [];
    if (!days.length) return null;
    const vals = days.map((d) => stepsForView(d, sourceView));
    const activeDays = vals.filter((v) => v > 0);
    const total = vals.reduce((a, b) => a + b, 0);
    const best = Math.max(...vals, 0);
    const bestIdx = vals.indexOf(best);
    const avg = activeDays.length > 0 ? Math.round(total / activeDays.length) : 0;
    const goalMet = vals.filter((v) => v >= goal).length;
    const weight = 70; // approximation for filtered stats
    const height = 170;
    return {
      total,
      avg,
      best,
      bestDate: best > 0 ? days[bestIdx]?.date ?? null : null,
      goalMet,
      totalKm: parseFloat((total * (height * 0.00415) / 1000).toFixed(1)),
      totalCalories: Math.round(total * 0.00057 * weight),
    };
  })();

  const hasBLEData = (history?.days ?? []).some((d) => (d.steps_ble ?? 0) > 0);

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <Text style={s.title}>Stats</Text>
        <View style={s.toggle}>
          {([7, 30] as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[s.toggleBtn, period === p && s.toggleOn]}
              onPress={() => switchPeriod(p)}
              testID={`period-${p}`}
            >
              <Text style={[s.toggleTxt, period === p && s.toggleTxtOn]}>
                {p === 7 ? "7 Days" : "30 Days"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 110 }]}
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
            {/* Chart Card */}
            <View style={s.card}>
              {/* Card header row: title + BLE badge if applicable */}
              <View style={s.chartHeader}>
                <Text style={s.cardTitle}>
                  {sourceView === "phone" ? "PHONE STEPS" : sourceView === "ble" ? "BLE STEPS" : "DAILY STEPS"} — {period} DAYS
                </Text>
                {hasBLEData && (
                  <View style={s.bleBadge}>
                    <Ionicons name="bluetooth" size={9} color={BLE_COLOR} />
                    <Text style={s.bleBadgeTxt}>BLE</Text>
                  </View>
                )}
              </View>

              {/* Source Toggle */}
              <View style={s.srcToggle}>
                {(["all", "phone", "ble"] as SourceView[]).map((sv) => (
                  <TouchableOpacity
                    key={sv}
                    style={[s.srcBtn, sourceView === sv && s.srcBtnOn,
                      sv === "ble" && sourceView === sv && s.srcBtnOnBle]}
                    onPress={() => setSourceView(sv)}
                    activeOpacity={0.8}
                  >
                    {sv !== "all" && (
                      <Ionicons
                        name={sv === "phone" ? "phone-portrait-outline" : "bluetooth"}
                        size={10}
                        color={sourceView === sv ? (sv === "ble" ? "#fff" : colors.onBrand) : colors.onSurfaceSecondary}
                      />
                    )}
                    <Text style={[
                      s.srcBtnTxt,
                      sourceView === sv && (sv === "ble" ? s.srcBtnTxtBle : s.srcBtnTxtOn),
                    ]}>
                      {sv === "all" ? "All" : sv === "phone" ? "Phone" : "BLE"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {history?.days.length ? (
                <BarChart
                  data={history.days}
                  goal={goal}
                  width={chartW}
                  sourceView={sourceView}
                />
              ) : (
                <View style={s.emptyChart}>
                  <Ionicons name="stats-chart-outline" size={36} color={colors.borderStrong} />
                  <Text style={s.emptyTxt}>No data yet. Start walking!</Text>
                </View>
              )}

              {/* BLE empty state */}
              {sourceView === "ble" && !hasBLEData && (
                <View style={s.bleEmptyRow}>
                  <Ionicons name="bluetooth-outline" size={14} color={colors.borderStrong} />
                  <Text style={s.bleEmptyTxt}>
                    No BLE data yet — connect a device from Profile to start tracking.
                  </Text>
                </View>
              )}

              {/* Legend */}
              <View style={s.legend}>
                {sourceView === "ble" ? (
                  <View style={s.legendItem}>
                    <View style={[s.dot, { backgroundColor: BLE_COLOR }]} />
                    <Text style={s.legendTxt}>BLE steps</Text>
                  </View>
                ) : (
                  <>
                    <View style={s.legendItem}>
                      <View style={[s.dot, { backgroundColor: colors.brand }]} />
                      <Text style={s.legendTxt}>Goal met</Text>
                    </View>
                    <View style={s.legendItem}>
                      <View style={[s.dot, { backgroundColor: colors.surfaceTertiary }]} />
                      <Text style={s.legendTxt}>Below goal</Text>
                    </View>
                  </>
                )}
                <View style={s.legendItem}>
                  <View style={s.dashLine} />
                  <Text style={s.legendTxt}>Goal line</Text>
                </View>
              </View>
            </View>

            {/* Summary — filtered by selected source */}
            {filteredSummary && (
              <View style={s.summaryGrid}>
                <SummaryCard
                  icon="footsteps"
                  color={sourceView === "ble" ? BLE_COLOR : colors.brand}
                  label="Avg Daily"
                  value={filteredSummary.avg.toLocaleString()}
                />
                <SummaryCard
                  icon="trophy"
                  color={colors.warning}
                  label="Best Day"
                  value={filteredSummary.best.toLocaleString()}
                />
                <SummaryCard
                  icon="ribbon"
                  color={colors.success}
                  label="Goals Hit"
                  value={`${filteredSummary.goalMet}/${period}`}
                />
                <SummaryCard
                  icon="map"
                  color={sourceView === "ble" ? BLE_COLOR : colors.brand}
                  label="Total km"
                  value={filteredSummary.totalKm.toFixed(1)}
                />
              </View>
            )}

            {/* Day list */}
            {history?.days && (
              <View style={s.listCard}>
                <Text style={s.listTitle}>DAILY BREAKDOWN</Text>
                {[...history.days].reverse().map((day) => {
                  const phone = day.steps_phone ?? 0;
                  const ble = day.steps_ble ?? 0;
                  const displayVal = stepsForView(day, sourceView);
                  const metGoal = displayVal >= goal;
                  return (
                    <View key={day.date} style={s.dayRow}>
                      <Text style={s.dayDate}>{formatDayLabel(day.date)}</Text>
                      <View style={s.dayRight}>
                        {metGoal && (
                          <View style={s.goalBadge}>
                            <Text style={s.goalBadgeTxt}>✓ Goal</Text>
                          </View>
                        )}
                        {/* When "all" mode: show both phone + BLE mini badges */}
                        {sourceView === "all" && (phone > 0 || ble > 0) && (
                          <View style={s.srcMiniRow}>
                            {phone > 0 && (
                              <View style={s.srcMini}>
                                <Ionicons name="phone-portrait-outline" size={9} color={colors.onSurfaceSecondary} />
                                <Text style={s.srcMiniTxt}>{phone.toLocaleString()}</Text>
                              </View>
                            )}
                            {ble > 0 && (
                              <View style={s.srcMini}>
                                <Ionicons name="bluetooth" size={9} color={BLE_COLOR} />
                                <Text style={[s.srcMiniTxt, { color: BLE_COLOR }]}>{ble.toLocaleString()}</Text>
                              </View>
                            )}
                          </View>
                        )}
                        <Text style={[s.daySteps, metGoal && { color: sourceView === "ble" ? BLE_COLOR : colors.brand }]}>
                          {displayVal.toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1,
    margin: 5,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    minHeight: 100,
  },
  val: { fontFamily: fonts.display, fontSize: 24, color: colors.onSurface },
  lbl: {
    fontFamily: fonts.text,
    fontSize: 10,
    color: colors.onSurfaceSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
});

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
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.onSurface,
    letterSpacing: 0.5,
  },
  toggle: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  toggleOn: { backgroundColor: colors.brand },
  toggleTxt: { fontFamily: fonts.textBold, fontSize: 12, color: colors.onSurfaceSecondary },
  toggleTxtOn: { color: colors.onBrand },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  loadBox: { height: 220, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: fonts.textBold,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    letterSpacing: 1,
    marginBottom: 10,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  bleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: BLE_COLOR + "22",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: BLE_COLOR + "40",
  },
  bleBadgeTxt: { fontFamily: fonts.textBold, fontSize: 10, color: BLE_COLOR },

  // Source view toggle
  srcToggle: {
    flexDirection: "row",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: 12,
    alignSelf: "flex-start",
    gap: 2,
  },
  srcBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  srcBtnOn: { backgroundColor: colors.brand },
  srcBtnOnBle: { backgroundColor: BLE_COLOR },
  srcBtnTxt: { fontFamily: fonts.textBold, fontSize: 11, color: colors.onSurfaceSecondary },
  srcBtnTxtOn: { color: colors.onBrand },
  srcBtnTxtBle: { color: "#fff" },

  // BLE empty hint
  bleEmptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  bleEmptyTxt: {
    flex: 1,
    fontFamily: fonts.text,
    fontSize: 11,
    color: colors.borderStrong,
    lineHeight: 16,
  },

  // Source mini badges in daily row
  srcMiniRow: { flexDirection: "row", alignItems: "center", gap: 6, marginRight: 4 },
  srcMini: { flexDirection: "row", alignItems: "center", gap: 3 },
  srcMiniTxt: {
    fontFamily: fonts.text,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
  },
  emptyChart: { height: 160, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTxt: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceSecondary },
  legend: { flexDirection: "row", gap: 16, marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dashLine: { width: 18, height: 2, backgroundColor: colors.brand, opacity: 0.6 },
  legendTxt: { fontFamily: fonts.text, fontSize: 11, color: colors.onSurfaceSecondary },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
    marginBottom: 12,
  },
  listCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  listTitle: {
    fontFamily: fonts.textBold,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    letterSpacing: 1,
    padding: 16,
    paddingBottom: 10,
  },
  dayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  dayDate: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurface },
  dayRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  goalBadge: {
    backgroundColor: colors.brand + "22",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  goalBadgeTxt: { fontFamily: fonts.textBold, fontSize: 11, color: colors.brand },
  daySteps: { fontFamily: fonts.displaySemi, fontSize: 16, color: colors.onSurface },
});
