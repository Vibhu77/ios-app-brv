// Brevo "Naos" design system tokens. React Native accepts hsl()/hsla() strings.
// This is a token swap + semantic mapping over the existing layout/components.
export const colors = {
  // Surfaces & text
  surface: "#FFFFFF",
  background: "hsl(0, 0%, 98%)",
  onSurface: "hsl(0, 0%, 11%)",
  onSurfaceSecondary: "hsl(0, 0%, 41%)",
  surfaceSecondary: "hsl(0, 0%, 96%)",
  onSurfaceSecondaryText: "hsl(0, 0%, 41%)",
  surfaceTertiary: "hsl(0, 0%, 93%)",
  onSurfaceTertiary: "hsl(0, 0%, 55%)",
  surfaceInverse: "hsl(0, 0%, 11%)",
  onSurfaceInverse: "#FFFFFF",

  // Brand / primary (charcoal — Brevo's primary)
  brand: "hsl(0, 0%, 11%)",
  brandPrimary: "hsl(0, 0%, 11%)",
  brandPrimaryPressed: "hsl(0, 0%, 28%)",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "hsl(0, 0%, 41%)",
  brandTertiary: "hsl(0, 0%, 96%)",
  onBrandTertiary: "hsl(0, 0%, 11%)",

  // Accent / information (iris purple) — links, highlights, selected states
  accent: "hsl(245, 67%, 61%)",
  onAccent: "#FFFFFF",

  // Semantic
  success: "hsl(162, 87%, 32%)",
  onSuccess: "#FFFFFF",
  error: "hsl(353, 100%, 61%)",
  onError: "#FFFFFF",
  warning: "hsl(15, 100%, 62%)",
  onWarning: "#FFFFFF",

  // Soft backgrounds + on-text (badges, KPI accents, toasts, banners)
  successBg: "hsl(164, 52%, 96%)",
  successText: "hsl(158, 100%, 21%)",
  errorBg: "hsl(354, 100%, 96%)",
  errorText: "hsl(349, 78%, 46%)",
  infoBg: "hsl(244, 70%, 96%)",
  infoText: "hsl(245, 43%, 43%)",
  warningBg: "hsl(16, 100%, 97%)",
  warningText: "hsl(14, 61%, 46%)",

  // Lines
  border: "hsl(0, 0%, 89%)",
  borderStrong: "hsl(0, 0%, 80%)",
  divider: "hsl(0, 0%, 89%)",

  // Signature Naos mint-green icon chip
  mint: "hsl(103, 96%, 89%)",
  onMint: "hsl(0, 0%, 11%)",
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
export const chartColors = [
  "hsl(245, 67%, 61%)",
  "hsl(180, 77%, 35%)",
  "hsl(338, 81%, 59%)",
  "hsl(209, 75%, 63%)",
  "hsl(47, 98%, 44%)",
];

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
