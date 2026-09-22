// Single shared date/time formatting utility. Every date render in the app
// routes through here so the Display preferences (date order, 12h/24h) apply
// uniformly. The API returns UTC; we render in the device timezone.
import { prefs } from "@/src/lib/prefs";

function parts(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return { dd, mm, yyyy };
}

export function formatDate(d: Date): string {
  const fmt = prefs.get().dateFormat; // "DD-MM-YYYY" | "MM-DD-YYYY"
  const { dd, mm, yyyy } = parts(d);
  return fmt === "MM-DD-YYYY" ? `${mm}-${dd}-${yyyy}` : `${dd}-${mm}-${yyyy}`;
}

export function formatTime(d: Date): string {
  const fmt = prefs.get().timeFormat; // "12h" | "24h"
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  if (fmt === "24h") return `${String(h).padStart(2, "0")}:${m}`;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export function formatDateTime(d: Date): string {
  return `${formatDate(d)} · ${formatTime(d)}`;
}
