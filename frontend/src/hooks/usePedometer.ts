import { useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import { Pedometer } from "expo-sensors";

export type PedoPermission = "granted" | "denied" | "undetermined" | "blocked" | "unknown";

export function usePedometer(onDelta: (delta: number) => void) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<PedoPermission>("unknown");
  const lastCount = useRef<number | null>(null);
  const onDeltaRef = useRef(onDelta);
  onDeltaRef.current = onDelta;

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let mounted = true;

    (async () => {
      try {
        const isAvail = await Pedometer.isAvailableAsync();
        if (!mounted) return;
        setAvailable(isAvail);
        if (!isAvail) return;

        if (Platform.OS === "web") {
          setPermission("granted");
        } else {
          const perm = await Pedometer.getPermissionsAsync();
          if (!mounted) return;
          if (perm.granted) setPermission("granted");
          else if (perm.status === "undetermined") setPermission("undetermined");
          else setPermission(perm.canAskAgain ? "denied" : "blocked");
          if (!perm.granted) return;
        }

        sub = Pedometer.watchStepCount((result) => {
          const prev = lastCount.current;
          if (prev === null) {
            // First callback: establish baseline only.
            // On Android TYPE_STEP_COUNTER returns steps since device boot (can be huge).
            // On iOS it returns steps since subscription start.
            // Either way we never emit on the first callback — just set the baseline.
            lastCount.current = result.steps;
            return;
          }
          if (result.steps > prev) {
            onDeltaRef.current(result.steps - prev);
            lastCount.current = result.steps;
          }
        });
      } catch {
        if (mounted) setAvailable(false);
      }
    })();

    return () => {
      mounted = false;
      sub?.remove();
    };
  }, [permission === "granted"]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestPermission = useCallback(async () => {
    try {
      const perm = await Pedometer.requestPermissionsAsync();
      if (perm.granted) setPermission("granted");
      else setPermission(perm.canAskAgain ? "denied" : "blocked");
      return perm.granted;
    } catch {
      setPermission("blocked");
      return false;
    }
  }, []);

  return { available, permission, requestPermission };
}
