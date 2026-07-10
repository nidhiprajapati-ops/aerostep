import React, { useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
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
  withSequence,
  withRepeat,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";

import { storage } from "@/src/utils/storage";
import { colors, fonts } from "@/src/theme";

const { width: W, height: H } = Dimensions.get("window");

// ── Ring constants ────────────────────────────────────────────────────────────
const RING = 148;
const STROKE = 3;
const RADIUS = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Speed-line config ─────────────────────────────────────────────────────────
const LINES = [
  { top: H * 0.265, w: W * 0.52, delay: 60,  alpha: 1   },
  { top: H * 0.300, w: W * 0.74, delay: 130, alpha: 0.7 },
  { top: H * 0.332, w: W * 0.36, delay: 20,  alpha: 0.5 },
  { top: H * 0.660, w: W * 0.46, delay: 200, alpha: 0.9 },
  { top: H * 0.692, w: W * 0.30, delay: 95,  alpha: 0.4 },
];

// ── SpeedLine (each has its own animated values) ──────────────────────────────
type LineProps = { top: number; w: number; delay: number; alpha: number };

function SpeedLine({ top, w, delay, alpha }: LineProps) {
  const tx = useSharedValue(-w);
  const op = useSharedValue(0);

  useEffect(() => {
    tx.value = withDelay(
      delay,
      withTiming(W + w, { duration: 680, easing: Easing.out(Easing.cubic) })
    );
    op.value = withDelay(
      delay,
      withSequence(
        withTiming(alpha, { duration: 120 }),
        withDelay(380, withTiming(0, { duration: 200 }))
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
    opacity: op.value,
  }));

  return (
    <Animated.View
      style={[{ position: "absolute", top, height: 2, left: 0 }, style]}
    >
      <LinearGradient
        colors={["transparent", colors.brand + "55", colors.brand + "33", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: w, height: 2 }}
      />
    </Animated.View>
  );
}

// ── Main intro screen ─────────────────────────────────────────────────────────
export default function Index() {
  const router = useRouter();
  const navigated = useRef(false);
  const exiting  = useRef(false);

  // Shared animation values
  const screenOp  = useSharedValue(1);
  const scanY     = useSharedValue(0);
  const scanOp    = useSharedValue(0);
  const ringOp    = useSharedValue(0);
  const ringScale = useSharedValue(0.35);
  const ringPulse = useSharedValue(1);
  const arcProg   = useSharedValue(0);     // 0 → 1, drives SVG strokeDashoffset
  const logoOp    = useSharedValue(0);
  const logoScale = useSharedValue(0.82);
  const lineW     = useSharedValue(0);     // 0 → LINE_MAX_W (px)
  const tagOp     = useSharedValue(0);
  const tagY      = useSharedValue(18);
  const ctaOp     = useSharedValue(0);
  const ctaScale  = useSharedValue(0.88);
  const ctaPulse  = useSharedValue(1);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const navigate = useCallback(async () => {
    if (navigated.current) return;
    navigated.current = true;
    const done = await storage.getItem<boolean>("profile_complete", false);
    router.replace(done ? "/(tabs)/home" : "/onboarding");
  }, [router]);

  const doExit = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    screenOp.value = withTiming(0, { duration: 400 }, () => runOnJS(navigate)());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timeline ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // --- 0 ms: scan line sweeps down (system-boot feel) ---
    scanOp.value = withSequence(
      withTiming(1, { duration: 180 }),
      withDelay(900, withTiming(0, { duration: 220 }))
    );
    scanY.value = withTiming(H, { duration: 1300, easing: Easing.linear });

    // --- 200 ms: ring springs in ---
    ringOp.value    = withDelay(200, withTiming(1, { duration: 450 }));
    ringScale.value = withDelay(200, withSpring(1, { damping: 11, stiffness: 85 }));

    // --- 350 ms: progress arc fills clockwise (1.9 s) ---
    arcProg.value = withDelay(350, withTiming(1, {
      duration: 1900,
      easing: Easing.out(Easing.cubic),
    }));

    // --- 850 ms: ring pulses gently after appearing ---
    ringPulse.value = withDelay(850,
      withRepeat(
        withSequence(
          withTiming(1.055, { duration: 850, easing: Easing.inOut(Easing.sin) }),
          withTiming(1,     { duration: 850, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );

    // --- 580 ms: wordmark zooms in ---
    logoOp.value    = withDelay(580, withTiming(1, { duration: 480 }));
    logoScale.value = withDelay(580, withSpring(1, { damping: 10, stiffness: 75 }));

    // --- 1050 ms: divider line extends ---
    lineW.value = withDelay(1050, withTiming(200, {
      duration: 420,
      easing: Easing.out(Easing.quad),
    }));

    // --- 1250 ms: tagline slides up ---
    tagOp.value = withDelay(1250, withTiming(1, { duration: 480 }));
    tagY.value  = withDelay(1250, withSpring(0, { damping: 14 }));

    // --- 2100 ms: CTA appears with subtle pulse ---
    ctaOp.value    = withDelay(2100, withTiming(1, { duration: 500 }));
    ctaScale.value = withDelay(2100, withSpring(1, { damping: 11 }));
    ctaPulse.value = withDelay(2800,
      withRepeat(
        withSequence(
          withTiming(1.035, { duration: 700, easing: Easing.inOut(Easing.sin) }),
          withTiming(1,     { duration: 700, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );

    // Auto-advance after 3.8 s
    const t = setTimeout(doExit, 3800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Animated styles ───────────────────────────────────────────────────────────
  const screenStyle  = useAnimatedStyle(() => ({ opacity: screenOp.value }));
  const scanStyle    = useAnimatedStyle(() => ({
    transform: [{ translateY: scanY.value }],
    opacity: scanOp.value,
  }));
  const ringStyle    = useAnimatedStyle(() => ({
    opacity: ringOp.value,
    transform: [{ scale: ringScale.value * ringPulse.value }],
  }));
  const arcProps     = useAnimatedProps(() => ({
    strokeDashoffset: CIRC * (1 - arcProg.value),
  }));
  const logoStyle    = useAnimatedStyle(() => ({
    opacity: logoOp.value,
    transform: [{ scale: logoScale.value }],
  }));
  const lineStyle    = useAnimatedStyle(() => ({
    width: lineW.value,
    opacity: lineW.value / 200,
  }));
  const tagStyle     = useAnimatedStyle(() => ({
    opacity: tagOp.value,
    transform: [{ translateY: tagY.value }],
  }));
  const ctaStyle     = useAnimatedStyle(() => ({
    opacity: ctaOp.value,
    transform: [{ scale: ctaScale.value * ctaPulse.value }],
  }));

  return (
    <Animated.View style={[s.root, screenStyle]}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={doExit}
      >
        {/* ── Background gradient ── */}
        <LinearGradient
          colors={["#0A0A0C", "#0D1109", "#080A06", "#0A0A0C"]}
          locations={[0, 0.35, 0.65, 1]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />

        {/* ── Radial glow behind ring ── */}
        <View style={s.glowBg} />

        {/* ── Scan line ── */}
        <Animated.View style={[s.scanLine, scanStyle]} />

        {/* ── Speed lines ── */}
        {LINES.map((l, i) => <SpeedLine key={i} {...l} />)}

        {/* ── Center content ── */}
        <View style={s.center} pointerEvents="none">

          {/* Ring + SVG progress arc */}
          <Animated.View style={[s.ringWrap, ringStyle]}>
            <View style={s.ringGlow} />
            <Svg
              width={RING}
              height={RING}
              style={{ transform: [{ rotate: "-90deg" }] }}
            >
              {/* Track */}
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={RADIUS}
                stroke="rgba(212,255,0,0.1)"
                strokeWidth={STROKE}
                fill="none"
              />
              {/* Animated progress arc */}
              <AnimatedCircle
                animatedProps={arcProps}
                cx={RING / 2}
                cy={RING / 2}
                r={RADIUS}
                stroke={colors.brand}
                strokeWidth={STROKE + 1}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${CIRC} ${CIRC}`}
              />
            </Svg>
            {/* Icon inside ring */}
            <View style={s.ringIcon}>
              <Text style={s.ringIconTxt}>⚡</Text>
            </View>
          </Animated.View>

          {/* AEROSTEP wordmark */}
          <Animated.View style={[s.logoWrap, logoStyle]}>
            <Text style={s.logoTxt}>AEROSTEP</Text>
          </Animated.View>

          {/* Divider */}
          <View style={s.lineTrack}>
            <Animated.View style={[s.line, lineStyle]} />
          </View>

          {/* Tagline */}
          <Animated.Text style={[s.tagline, tagStyle]}>
            YOUR PERSONAL FITNESS COACH
          </Animated.Text>
        </View>

        {/* ── Bottom CTA ── */}
        <Animated.View style={[s.ctaWrap, ctaStyle]} pointerEvents="none">
          <View style={s.ctaBtn}>
            <Text style={s.ctaTxt}>TAP TO BEGIN  →</Text>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const LINE_TRACK_W = 200;

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A0A0C",
  },

  // Background glow (soft radial brand-color blob at center)
  glowBg: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: colors.brand,
    opacity: 0.045,
    top: H / 2 - 200,
    alignSelf: "center",
  },

  // Scan line
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    top: 0,
    backgroundColor: "rgba(212,255,0,0.18)",
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 6,
  },

  // Center column
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  // Ring wrapper
  ringWrap: {
    width: RING,
    height: RING,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  ringGlow: {
    position: "absolute",
    width: RING * 1.55,
    height: RING * 1.55,
    borderRadius: RING,
    backgroundColor: colors.brand,
    opacity: 0.07,
  },
  ringIcon: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  ringIconTxt: {
    fontSize: 40,
  },

  // Wordmark
  logoWrap: {
    alignItems: "center",
    marginTop: 2,
  },
  logoTxt: {
    fontFamily: fonts.display,
    fontSize: 52,
    color: colors.brand,
    letterSpacing: 9,
    lineHeight: 58,
  },

  // Divider
  lineTrack: {
    width: LINE_TRACK_W,
    height: 1,
    backgroundColor: "rgba(212,255,0,0.08)",
    marginVertical: 4,
    overflow: "hidden",
    alignItems: "flex-start",
  },
  line: {
    height: 1,
    backgroundColor: colors.brand,
    opacity: 0,
  },

  // Tagline
  tagline: {
    fontFamily: fonts.text,
    fontSize: 11,
    color: "rgba(255,255,255,0.38)",
    letterSpacing: 3.5,
    textAlign: "center",
    marginTop: 2,
  },

  // CTA
  ctaWrap: {
    alignItems: "center",
    paddingBottom: 62,
  },
  ctaBtn: {
    borderWidth: 1,
    borderColor: "rgba(212,255,0,0.28)",
    borderRadius: 100,
    paddingHorizontal: 30,
    paddingVertical: 14,
    backgroundColor: "rgba(212,255,0,0.05)",
  },
  ctaTxt: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.brand,
    letterSpacing: 3,
  },
});
