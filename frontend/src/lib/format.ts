export const nf = (n?: number) => (n == null ? "0" : Math.round(n).toLocaleString());

export const pctStr = (num?: number, den?: number) => {
  if (!den) return "0%";
  return `${(((num || 0) / den) * 100).toFixed(1)}%`;
};

export const pctVal = (num?: number, den?: number) => (den ? (num || 0) / den : 0);

export const fmtDate = (s?: string) => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export const fmtDateTime = (s?: string) => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const titleCase = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
