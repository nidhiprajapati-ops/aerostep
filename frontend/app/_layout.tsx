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

// react-native-keyboard-controller has no web support — skip it on web
// to prevent a blank screen caused by missing native bindings.
let KeyboardProvider: React.ComponentType<{ children: React.ReactNode }>;
if (Platform.OS !== "web") {
  KeyboardProvider = require("react-native-keyboard-controller").KeyboardProvider;
} else {
  KeyboardProvider = ({ children }: { children: React.ReactNode }) => (
    <View style={{ flex: 1 }}>{children}</View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts(
    // On web, custom fonts are handled by CSS — skip blocking load to prevent
    // the app hanging on a blank white screen if Metro font assets are unavailable.
    Platform.OS !== "web"
      ? {
          "BarlowCondensed-Bold": require("../assets/fonts/BarlowCondensed-Bold.ttf"),
          "BarlowCondensed-SemiBold": require("../assets/fonts/BarlowCondensed-SemiBold.ttf"),
          "Satoshi-Medium": require("../assets/fonts/Satoshi-Medium.ttf"),
          "Satoshi-Bold": require("../assets/fonts/Satoshi-Bold.ttf"),
        }
      : {}
  );

  // On web, fonts resolve immediately (empty map → [true, null]).
  // On native, wait for actual font loading.
  const iconsReady = loaded || !!error;
  const textReady = fontsLoaded || !!fontsError;

  useEffect(() => {
    if (iconsReady && textReady) {
      SplashScreen.hideAsync();
    }
  }, [iconsReady, textReady]);

  // Block render until fonts are ready (native only — web always passes above)
  if (!iconsReady || !textReady) return null;

  return (
    <KeyboardProvider>
      <BLEProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0A0C" } }} />
      </BLEProvider>
    </KeyboardProvider>
  );
}
