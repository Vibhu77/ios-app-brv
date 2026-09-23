// Local, persisted user preferences. Stored in AsyncStorage under keys prefixed
// "settings." and hydrated into memory at startup so reads are synchronous.
import { storage } from "@/src/utils/storage";

const KEY_FOCUS = "settings.refreshOnFocus";
const KEY_PAGE = "settings.pageSize";

export type Prefs = {
  refreshOnFocus: boolean; // default ON (current behaviour)
  pageSize: 25 | 50; // default 25; hard cap 50 (Brevo 500s at limit>=~90-100)
};

const DEFAULTS: Prefs = { refreshOnFocus: true, pageSize: 25 };

let current: Prefs = { ...DEFAULTS };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const prefs = {
  // Synchronous read of the in-memory copy.
  get(): Prefs {
    return current;
  },

  // Hydrate from AsyncStorage at app start.
  async load(): Promise<Prefs> {
    try {
      const [focus, page] = await Promise.all([
        storage.getItem(KEY_FOCUS, DEFAULTS.refreshOnFocus),
        storage.getItem(KEY_PAGE, DEFAULTS.pageSize),
      ]);
      current = {
        refreshOnFocus: typeof focus === "boolean" ? focus : DEFAULTS.refreshOnFocus,
        pageSize: page === 50 ? 50 : 25,
      };
    } catch {
      current = { ...DEFAULTS };
    }
    emit();
    return current;
  },

  async set<K extends keyof Prefs>(key: K, value: Prefs[K]): Promise<void> {
    current = { ...current, [key]: value };
    emit();
    const keyMap: Record<keyof Prefs, string> = {
      refreshOnFocus: KEY_FOCUS,
      pageSize: KEY_PAGE,
    };
    await storage.setItem(keyMap[key], value as any);
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
