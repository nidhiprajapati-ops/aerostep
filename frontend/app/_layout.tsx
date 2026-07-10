import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { LogBox, Platform, View } from "react-native";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { BLEProvider } from "@/src/context/BLEContext";
// Register background step-sync task at app startup (no-op on web / Expo Go)
import "@/src/tasks/backgroundStepTask";

// Disable logbox errors so users can see the app cleanly
LogBox.ignoreAllLogs(true);

// Keep native splash visible until fonts are ready
SplashScreen.preventAutoHideAsync();

// react-native-keyboard-controller has no web support, and its native module
// isn't linked in Expo Go either — both throw at require() time, so fall back
// to a passthrough view rather than crashing the whole tree on either.
let KeyboardProvider: React.ComponentType<{ children: React.ReactNode }>;
if (Platform.OS !== "web") {
  try {
    KeyboardProvider = require("react-native-keyboard-controller").KeyboardProvider;
  } catch {
    KeyboardProvider = ({ children }: { children: React.ReactNode }) => (
      <View style={{ flex: 1 }}>{children}</View>
    );
  }
} else {
  KeyboardProvider = ({ children }: { children: React.ReactNode }) => (
    <View style={{ flex: 1 }}>{children}</View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    "BarlowCondensed-Bold":    require("../assets/fonts/BarlowCondensed-Bold.ttf"),
    "BarlowCondensed-SemiBold": require("../assets/fonts/BarlowCondensed-SemiBold.ttf"),
    "Satoshi-Medium":          require("../assets/fonts/Satoshi-Medium.ttf"),
    "Satoshi-Bold":            require("../assets/fonts/Satoshi-Bold.ttf"),
  });

  const iconsReady = loaded || !!error;
  const textReady = fontsLoaded || !!fontsError;

  useEffect(() => {
    if (iconsReady && textReady) {
      SplashScreen.hideAsync();
    }
  }, [iconsReady, textReady]);

  // On native: block until fonts are ready (splash screen covers the wait).
  // On web: render immediately — fonts load via CSS and snap in when ready,
  // blocking would cause a permanent blank screen if Metro can't serve the .ttf.
  if (Platform.OS !== "web" && (!iconsReady || !textReady)) return null;

  return (
    <KeyboardProvider>
      <BLEProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0A0C" } }} />
      </BLEProvider>
    </KeyboardProvider>
  );
}
