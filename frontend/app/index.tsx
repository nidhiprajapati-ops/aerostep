import { useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { storage } from "@/src/utils/storage";
import { colors } from "@/src/theme";

export default function Index() {
  const router = useRouter();
  const navigated = useRef(false);

  useEffect(() => {
    // Guard: only navigate once, even if fonts re-render the layout
    if (navigated.current) return;
    navigated.current = true;

    (async () => {
      const done = await storage.getItem<boolean>("profile_complete", false);
      router.replace(done ? "/(tabs)/home" : "/onboarding");
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container} testID="splash-loading">
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
