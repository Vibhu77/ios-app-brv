import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";

// Runs `fn` on screen focus (tab switch / navigate back) AND when the app
// returns to the foreground while this screen is focused. Used to trigger a
// background refetch for stale-while-revalidate.
export function useFocusRefetch(fn: () => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useFocusEffect(
    useCallback(() => {
      fnRef.current();
    }, [])
  );

  const isFocused = useIsFocused();
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && isFocused) fnRef.current();
    });
    return () => sub.remove();
  }, [isFocused]);
}
