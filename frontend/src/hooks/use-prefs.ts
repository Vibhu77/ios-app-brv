import { useSyncExternalStore } from "react";
import { prefs, Prefs } from "@/src/lib/prefs";

// Reactive access to the persisted preferences.
export function usePrefs(): Prefs {
  return useSyncExternalStore(prefs.subscribe, prefs.get, prefs.get);
}
