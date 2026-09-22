import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { prefs } from "@/src/lib/prefs";

// Runs `fn` on screen focus (tab switch / navigate back) AND when the app
// returns to the foreground while this screen is focused. Used to trigger a
// background refetch for stale-while-revalidate. The "Refresh on app focus"
// preference gates this — when OFF we only run on the very first focus.
export function useFocusRefetch(fn: () => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const ranOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!prefs.get().refreshOnFocus && ranOnce.current) return;
      ranOnce.current = true;
      fnRef.current();
    }, [])
  );

  const isFocused = useIsFocused();
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && isFocused && prefs.get().refreshOnFocus) fnRef.current();
    });
    return () => sub.remove();
  }, [isFocused]);
}
