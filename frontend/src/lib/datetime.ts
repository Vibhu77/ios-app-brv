// Single shared date/time formatting utility. Every date render in the app
// routes through here. One fixed format app-wide ("12 Sep 2026, 14:30"),
// matching Brevo's day-first, 24-hour convention. The API returns UTC;
// we render in the device timezone.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function formatDateTime(d: Date): string {
  return `${formatDate(d)}, ${formatTime(d)}`;
}
