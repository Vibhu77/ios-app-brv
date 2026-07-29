import React from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, shadow, fonts } from "@/src/theme";
import { titleCase } from "@/src/lib/format";

// ---------- Signature mint-green icon chip ----------
export function IconChip({
  icon,
  size = 36,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  size?: number;
}) {
  return (
    <View style={[chipStyles.chip, { width: size, height: size }]}>
      <Ionicons name={icon} size={size * 0.5} color={colors.onMint} />
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    borderRadius: 10,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ---------- Status badge ----------
export function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    sent: { bg: colors.successBg, fg: colors.successText },
    queued: { bg: colors.infoBg, fg: colors.infoText },
    scheduled: { bg: colors.infoBg, fg: colors.infoText },
    inProcess: { bg: colors.infoBg, fg: colors.infoText },
    draft: { bg: colors.surfaceSecondary, fg: colors.onSurfaceSecondary },
    archive: { bg: colors.surfaceSecondary, fg: colors.onSurfaceSecondary },
    suspended: { bg: colors.errorBg, fg: colors.errorText },
  };
  const s = map[status || "draft"] || map.draft;
  return (
    <View style={[badgeStyles.badge, { backgroundColor: s.bg }]}>
      <Text style={[badgeStyles.badgeText, { color: s.fg }]}>{titleCase(status || "draft")}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  badgeText: { fontSize: font.sm, fontWeight: "700" },
});

// ---------- Avatar ----------
export function Avatar({ label, size = 44 }: { label: string; size?: number }) {
  const initials = getInitials(label);
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

export function getInitials(value: string) {
  if (!value) return "?";
  const clean = value.split("@")[0].replace(/[._-]+/g, " ").trim();
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 0) return value[0]?.toUpperCase() || "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ---------- KPI scorecard ----------
export function KpiCard({
  label,
  value,
  sub,
  icon,
  testID,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
}) {
  return (
    <View style={styles.kpi} testID={testID}>
      {icon ? (
        <View style={styles.kpiChip}>
          <IconChip icon={icon} size={32} />
        </View>
      ) : null}
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

// ---------- Stat row with percentage bar ----------
export function StatRow({
  label,
  value,
  pct,
  color = colors.brandPrimary,
}: {
  label: string;
  value: string;
  pct?: number; // 0..1
  color?: string;
}) {
  return (
    <View style={styles.statRow}>
      <View style={styles.statRowHead}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
      {pct !== undefined ? (
        <View style={styles.barTrack}>
          <View
            style={[styles.barFill, { width: `${Math.min(100, Math.max(0, pct * 100))}%`, backgroundColor: color }]}
          />
        </View>
      ) : null}
    </View>
  );
}

// ---------- Primary / secondary buttons ----------
export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  icon,
  testID,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const isDisabled = disabled || loading;
  const bg =
    variant === "secondary" ? colors.surfaceSecondary : variant === "danger" ? colors.surface : colors.brandPrimary;
  const fg =
    variant === "secondary" ? colors.onSurface : variant === "danger" ? colors.error : colors.onBrandPrimary;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "danger" && { borderWidth: 1, borderColor: colors.border },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// ---------- Empty / error / loading states ----------
export function StateView({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.state} testID={testID}>
      <View style={styles.stateIcon}>
        <Ionicons name={icon} size={30} color={colors.onSurfaceTertiary} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      {message ? <Text style={styles.stateMsg}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.lg, alignSelf: "stretch" }}>
          <PrimaryButton title={actionLabel} onPress={onAction} testID="state-action-button" />
        </View>
      ) : null}
    </View>
  );
}

export function Loader() {
  return (
    <View style={styles.loader}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

// ---------- Skeleton block ----------
export function Skeleton({ style }: { style?: ViewStyle }) {
  return <View style={[styles.skeleton, style]} />;
}

// ---------- Card container ----------
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onBrandTertiary, fontWeight: "700" },
  kpi: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kpiChip: { marginBottom: spacing.md, alignSelf: "flex-start" },
  kpiValue: { fontSize: font.xxl, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 },
  kpiLabel: { fontSize: font.sm, color: colors.onSurfaceSecondary, marginTop: spacing.xs, fontWeight: "600" },
  kpiSub: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
  statRow: { paddingVertical: spacing.md },
  statRowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statLabel: { fontSize: font.base, color: colors.onSurfaceSecondary, fontWeight: "600" },
  statValue: { fontSize: font.lg, color: colors.onSurface, fontWeight: "700" },
  barTrack: {
    height: 6,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: radius.pill },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  btnText: { fontSize: font.lg, fontWeight: "700" },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
  },
  stateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  stateTitle: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  stateMsg: {
    fontSize: font.base,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  skeleton: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
});
