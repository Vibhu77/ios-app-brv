import { formatDate as formatDateImpl, formatDateTime as formatDateTimeImpl } from "@/src/lib/datetime";

export const nf = (n?: number) => (n == null ? "0" : Math.round(n).toLocaleString());

export const pctStr = (num?: number, den?: number) => {
  if (!den) return "0%";
  return `${(((num || 0) / den) * 100).toFixed(1)}%`;
};

// 2-decimal rate like the campaign detail ("14.30%", "0%" when zero). Never NaN.
export const pct2 = (num?: number, den?: number) => {
  if (!den || !num) return "0%";
  const v = (num / den) * 100;
  if (!isFinite(v) || v === 0) return "0%";
  return `${v.toFixed(2)}%`;
};

// Rate clamped to 0–100 for progress bars.
export const rate01 = (num?: number, den?: number) => {
  if (!den || !num) return 0;
  const v = (num / den) * 100;
  return isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
};

export const pctVal = (num?: number, den?: number) => (den ? (num || 0) / den : 0);

export const fmtDate = (s?: string) => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return formatDateImpl(d);
};

export const fmtDateTime = (s?: string) => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return formatDateTimeImpl(d);
};

export const titleCase = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

export const relTime = (s?: string) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDateImpl(d);
};
