// Local, persisted user preferences. Stored in AsyncStorage under keys prefixed
// "settings." and hydrated into memory at startup so reads are synchronous.
import { storage } from "@/src/utils/storage";

const KEY_FOCUS = "settings.refreshOnFocus";
const KEY_PAGE = "settings.pageSize";
const KEY_TIME = "settings.timeFormat";
const KEY_DATE = "settings.dateFormat";

export type TimeFormat = "12h" | "24h";
export type DateFormat = "DD-MM-YYYY" | "MM-DD-YYYY";

export type Prefs = {
  refreshOnFocus: boolean; // default ON (current behaviour)
  pageSize: 25 | 50; // default 25; hard cap 50 (Brevo 500s at limit>=~90-100)
  timeFormat: TimeFormat; // default from device locale on first launch
  dateFormat: DateFormat; // default from device locale on first launch
};

// Derive locale-appropriate defaults from the device via Intl (no extra dep).
function localeDefaults(): { timeFormat: TimeFormat; dateFormat: DateFormat } {
  let timeFormat: TimeFormat = "12h";
  let dateFormat: DateFormat = "DD-MM-YYYY";
  try {
    // 12h vs 24h: presence of a dayPeriod token means the locale uses 12h.
    const timeParts = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).formatToParts(new Date(2001, 0, 1, 13));
    timeFormat = timeParts.some((p) => p.type === "dayPeriod") ? "12h" : "24h";
    // Date order: if month precedes day, the locale is MDY (e.g. en-US).
    const dateParts = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(2001, 10, 22));
    const order = dateParts.map((p) => p.type);
    dateFormat = order.indexOf("month") < order.indexOf("day") ? "MM-DD-YYYY" : "DD-MM-YYYY";
  } catch {
    /* keep safe defaults */
  }
  return { timeFormat, dateFormat };
}

const DEFAULTS: Prefs = { refreshOnFocus: true, pageSize: 25, ...localeDefaults() };

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
      const [focus, page, time, date] = await Promise.all([
        storage.getItem(KEY_FOCUS, DEFAULTS.refreshOnFocus),
        storage.getItem(KEY_PAGE, DEFAULTS.pageSize),
        storage.getItem(KEY_TIME, DEFAULTS.timeFormat),
        storage.getItem(KEY_DATE, DEFAULTS.dateFormat),
      ]);
      current = {
        refreshOnFocus: typeof focus === "boolean" ? focus : DEFAULTS.refreshOnFocus,
        pageSize: page === 50 ? 50 : 25,
        timeFormat: time === "24h" ? "24h" : "12h",
        dateFormat: date === "MM-DD-YYYY" ? "MM-DD-YYYY" : "DD-MM-YYYY",
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
      timeFormat: KEY_TIME,
      dateFormat: KEY_DATE,
    };
    await storage.setItem(keyMap[key], value as any);
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
