// Brevo "Naos" design system tokens. React Native accepts hsl()/hsla() strings.
// This is a token swap + semantic mapping over the existing layout/components.
export const colors = {
  // Surfaces & text
  surface: "#FFFFFF",
  background: "#FAFAFA",
  onSurface: "#1B1B1B",
  onSurfaceSecondary: "#696969",
  surfaceSecondary: "#F0F0F0",
  onSurfaceSecondaryText: "#696969",
  surfaceTertiary: "#EDEDED",
  onSurfaceTertiary: "#8A8A8A",
  surfaceInverse: "#1B1B1B",
  onSurfaceInverse: "#FFFFFF",

  // Brand / primary (charcoal — Brevo's primary)
  brand: "#1B1B1B",
  brandPrimary: "#1B1B1B",
  brandPrimaryPressed: "#2C2C2C",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#696969",
  brandTertiary: "#F0F0F0",
  onBrandTertiary: "#1B1B1B",

  // Accent / information (iris purple) — links, highlights, selected states
  accent: "#6358DE",
  onAccent: "#FFFFFF",

  // Semantic
  success: "#0B9A6F",
  onSuccess: "#FFFFFF",
  error: "#FF3A51",
  onError: "#FFFFFF",
  negativePress: "#CF1A3B",
  warning: "#FF6E3D",
  onWarning: "#FFFFFF",

  // Soft backgrounds + on-text (badges, KPI accents, toasts, banners)
  // *Ink/Text tones are darkened for AA contrast on their own tinted backgrounds.
  successBg: "#EFFAF7",
  successText: "#006A43",
  errorBg: "#FFECEE",
  errorText: "#CF1A3B",
  infoBg: "#EFEEFC",
  infoText: "#463E9B",
  warningBg: "#FFF4F0",
  warningText: "#A24428",

  // Lines
  border: "#E3E3E3",
  borderStrong: "#CFCFCF",
  divider: "#E3E3E3",

  // Signature Naos mint-green icon chip
  mint: "hsl(103, 96%, 89%)",
  onMint: "#1B1B1B",
  mintEyebrow: "hsl(103, 64%, 83%)",
  // Login hero gradient (deep forest -> green)
  heroGradientFrom: "hsl(156, 100%, 13%)",
  heroGradientTo: "hsl(162, 86%, 32%)",
};

// Inter font families (loaded in the root layout).
export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

// Chart palette (use in order when trend charts are added)
export const chartColors = ["#6358DE", "#149E9E", "#EB4280", "#5AA3E7", "#DEAE02"];

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 32,
  pill: 999,
};

export const font = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  display: 30,
};

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
};
