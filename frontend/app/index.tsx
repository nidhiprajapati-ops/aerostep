import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  withDelay,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { storage } from "@/src/utils/storage";
import { colors, fonts } from "@/src/theme";

const { height: H } = Dimensions.get("window");

// ── Ring constants (mirrors home screen ProgressRing) ──────────────────────────
const RING_SIZE   = 210;
const STROKE_W    = 14;
const RADIUS      = (RING_SIZE - STROKE_W) / 2;
const CIRC        = 2 * Math.PI * RADIUS;

// Target: ring fills to 84.3% representing 8,432 / 10,000 steps
const TARGET_STEPS      = 8_432;
const ARC_TARGET        = 0.843;
const COUNT_DELAY_MS    = 220;
const COUNT_DURATION_MS = 1_600;
const EXIT_AT_MS        = 3_300;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Main intro screen ─────────────────────────────────────────────────────────
export default function Index() {
  const router    = useRouter();
  const navigated = useRef(false);
  const [displayCount, setDisplayCount] = useState(0);

  // Reanimated shared values
  const screenOp  = useSharedValue(1);
  const ringOp    = useSharedValue(0);
  const ringScale = useSharedValue(0.7);
  const arcProg   = useSharedValue(0);
  const logoOp    = useSharedValue(0);
  const logoY     = useSharedValue(18);
  const tagOp     = useSharedValue(0);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const navigate = useCallback(async () => {
    if (navigated.current) return;
    navigated.current = true;
    const done = await storage.getItem<boolean>("profile_complete", false);
    router.replace(done ? "/(tabs)/home" : "/onboarding");
  }, [router]);

  const doExit = useCallback(() => {
    screenOp.value = withTiming(0, { duration: 380 }, () => runOnJS(navigate)());
  // screenOp is a stable SharedValue ref — safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // ── Step counter animation (JS/RAF side) ─────────────────────────────────────
  useEffect(() => {
    let frameId: number;
    let startTs: number | null = null;

    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const elapsed = ts - startTs;
      const t       = Math.min(elapsed / COUNT_DURATION_MS, 1);
      const eased   = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplayCount(Math.round(eased * TARGET_STEPS));
      if (t < 1) frameId = requestAnimationFrame(tick);
    };

    const delay = setTimeout(() => {
      frameId = requestAnimationFrame(tick);
    }, COUNT_DELAY_MS);

    return () => {
      clearTimeout(delay);
      cancelAnimationFrame(frameId);
    };
  }, []);

  // ── Main timeline ─────────────────────────────────────────────────────────────
  useEffect(() => {
    // 100 ms — ring springs in
    ringOp.value    = withDelay(100, withTiming(1, { duration: 400 }));
    ringScale.value = withDelay(100, withSpring(1, { damping: 13, stiffness: 80 }));

    // 220 ms — arc fills to 84.3 % in sync with counter
    arcProg.value = withDelay(COUNT_DELAY_MS, withTiming(ARC_TARGET, {
      duration: COUNT_DURATION_MS,
      easing:   Easing.out(Easing.cubic),
    }));

    // 1 100 ms — wordmark slides up + fades in
    logoOp.value = withDelay(1_100, withTiming(1, { duration: 480 }));
    logoY.value  = withDelay(1_100, withSpring(0, { damping: 14 }));

    // 1 680 ms — tagline fades in
    tagOp.value = withDelay(1_680, withTiming(1, { duration: 420 }));

    // Auto-advance at EXIT_AT_MS
    const timer = setTimeout(doExit, EXIT_AT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Animated styles ───────────────────────────────────────────────────────────
  const screenStyle = useAnimatedStyle(() => ({ opacity: screenOp.value }));
  const ringStyle   = useAnimatedStyle(() => ({
    opacity:   ringOp.value,
    transform: [{ scale: ringScale.value }],
  }));
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRC * (1 - arcProg.value),
  }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity:   logoOp.value,
    transform: [{ translateY: logoY.value }],
  }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tagOp.value }));

  return (
    <Animated.View style={[s.root, screenStyle]}>
      {/* Ambient brand glow */}
      <View style={s.glow} />

      {/* Center layout */}
      <View style={s.center}>

        {/* ── Progress ring — same design as home screen ── */}
        <Animated.View style={[s.ringWrap, ringStyle]}>
          <Svg
            width={RING_SIZE}
            height={RING_SIZE}
            style={{ transform: [{ rotate: "-90deg" }] }}
          >
            {/* Track */}
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={colors.surfaceTertiary}
              strokeWidth={STROKE_W}
              fill="none"
            />
            {/* Animated fill arc */}
            <AnimatedCircle
              animatedProps={arcProps}
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={colors.brand}
              strokeWidth={STROKE_W}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRC} ${CIRC}`}
            />
          </Svg>

          {/* Content inside ring */}
          <View style={s.ringInner}>
            <Text style={s.countTxt}>{displayCount.toLocaleString()}</Text>
            <Text style={s.countGoal}>/ 10,000</Text>
            <Text style={s.stepsLabel}>STEPS</Text>
          </View>
        </Animated.View>

        {/* ── Wordmark + tagline ── */}
        <Animated.View style={[s.logoBlock, logoStyle]}>
          <Text style={s.appName}>AEROSTEP</Text>
          <Animated.View style={tagStyle}>
            <View style={s.divider} />
            <Text style={s.tagline}>TRACK EVERY STEP</Text>
          </Animated.View>
        </Animated.View>

      </View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  // Soft radial brand glow
  glow: {
    position:        "absolute",
    width:           300,
    height:          300,
    borderRadius:    150,
    backgroundColor: colors.brand,
    opacity:         0.05,
    top:             H / 2 - 210,
    alignSelf:       "center",
  },

  // Vertical stack
  center: {
    alignItems: "center",
    gap: 32,
  },

  // Ring wrapper (absolute-positioned inner content overlay)
  ringWrap: {
    width:           RING_SIZE,
    height:          RING_SIZE,
    alignItems:      "center",
    justifyContent:  "center",
  },
  ringInner: {
    position:       "absolute",
    alignItems:     "center",
  },
  countTxt: {
    fontFamily: fonts.display,
    fontSize:   46,
    color:      colors.onSurface,
    lineHeight: 50,
  },
  countGoal: {
    fontFamily: fonts.text,
    fontSize:   14,
    color:      colors.onSurfaceSecondary,
    marginTop:  2,
  },
  stepsLabel: {
    fontFamily:    fonts.textBold,
    fontSize:      10,
    color:         colors.onSurfaceSecondary,
    letterSpacing: 2,
    marginTop:     4,
  },

  // Wordmark block
  logoBlock: {
    alignItems: "center",
    gap: 0,
  },
  appName: {
    fontFamily:    fonts.display,
    fontSize:      44,
    color:         colors.brand,
    letterSpacing: 8,
    lineHeight:    48,
  },
  divider: {
    width:           52,
    height:          1,
    backgroundColor: colors.borderStrong,
    alignSelf:       "center",
    marginTop:       12,
    marginBottom:    10,
  },
  tagline: {
    fontFamily:    fonts.text,
    fontSize:      11,
    color:         colors.onSurfaceSecondary,
    letterSpacing: 3,
    textAlign:     "center",
  },
});
