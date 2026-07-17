import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { GlassHeader } from "@/src/components/Header";
import { Avatar, StateView, Loader, Card, PrimaryButton } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { brevo, Contact } from "@/src/lib/brevo";
import { fmtDate, nf } from "@/src/lib/format";

function contactName(c?: Contact | null) {
  if (!c) return "";
  const a = c.attributes || {};
  return [a.FIRSTNAME, a.LASTNAME].filter(Boolean).join(" ").trim() || a.NAME || "";
}

function count(arr: any): number {
  return Array.isArray(arr) ? arr.length : 0;
}

export default function ContactDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useBrevo();
  const [contact, setContact] = useState<Contact | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await brevo.getContact(token, id);
      setContact(c);
      try {
        const s = await brevo.getContactStats(token, id);
        setStats(s);
      } catch {
        setStats(null);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load contact");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const name = contactName(contact);
  const attrs = contact?.attributes || {};
  const attrKeys = Object.keys(attrs).filter((k) => attrs[k] !== "" && attrs[k] != null);

  return (
    <View style={styles.container}>
      <GlassHeader title={name || "Contact"} onBack={() => router.back()} />
      {loading ? (
        <Loader />
      ) : error ? (
        <View style={{ flex: 1, paddingTop: insets.top + 52 }}>
          <StateView
            icon="cloud-offline-outline"
            title="Couldn't load contact"
            message={error}
            actionLabel="Retry"
            onAction={load}
            testID="contact-detail-error"
          />
        </View>
      ) : (
        <>
          <ScrollView
            testID="contact-detail-scroll"
            contentContainerStyle={{
              paddingTop: insets.top + 64,
              paddingHorizontal: spacing.lg,
              paddingBottom: insets.bottom + 120,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.profile}>
              <Avatar label={name || contact?.email || "?"} size={72} />
              <Text style={styles.email} numberOfLines={1}>
                {contact?.email}
              </Text>
              {name ? <Text style={styles.name}>{name}</Text> : null}
              <View style={styles.badges}>
                {contact?.emailBlacklisted ? (
                  <Tag label="Email blacklisted" tone="error" />
                ) : (
                  <Tag label="Subscribed" tone="success" />
                )}
                {contact?.smsBlacklisted ? <Tag label="SMS blocked" tone="warning" /> : null}
              </View>
            </View>

            {/* Activity */}
            <Text style={styles.section}>Activity (last 90 days)</Text>
            <View style={styles.activityRow}>
              <ActivityCard label="Received" value={nf(count(stats?.messagesSent))} />
              <ActivityCard label="Opened" value={nf(count(stats?.opened))} />
              <ActivityCard label="Clicked" value={nf(count(stats?.clicked))} />
            </View>

            {/* Contact info */}
            <Text style={styles.section}>Contact info</Text>
            <Card>
              <InfoRow label="Email" value={contact?.email || "—"} />
              <Divider />
              <InfoRow label="Contact ID" value={String(contact?.id ?? "—")} />
              <Divider />
              <InfoRow label="Created" value={fmtDate(contact?.createdAt)} />
              <Divider />
              <InfoRow label="Modified" value={fmtDate(contact?.modifiedAt)} />
            </Card>

            {/* Attributes */}
            {attrKeys.length > 0 ? (
              <>
                <Text style={styles.section}>Attributes</Text>
                <Card>
                  {attrKeys.map((k, i) => (
                    <View key={k}>
                      {i > 0 ? <Divider /> : null}
                      <InfoRow label={k} value={String(attrs[k])} />
                    </View>
                  ))}
                </Card>
              </>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
            <PrimaryButton
              title="Edit Contact"
              icon="create-outline"
              onPress={() => router.push({ pathname: "/contact/form", params: { id: String(contact?.id) } })}
              testID="edit-contact-button"
            />
          </View>
        </>
      )}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function ActivityCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.activityCard}>
      <Text style={styles.activityValue}>{value}</Text>
      <Text style={styles.activityLabel}>{label}</Text>
    </View>
  );
}

function Tag({ label, tone }: { label: string; tone: "success" | "error" | "warning" }) {
  const map = {
    success: { bg: "#E6F0EC", fg: colors.success },
    error: { bg: "#F5E4E2", fg: colors.error },
    warning: { bg: "#FBF0E1", fg: colors.warning },
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: map.bg }]}>
      <Text style={[styles.tagText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  profile: { alignItems: "center", paddingVertical: spacing.lg },
  email: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  name: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  badges: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  section: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.md },
  activityRow: { flexDirection: "row", gap: spacing.md },
  activityCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  activityValue: { fontSize: font.xxl, fontWeight: "800", color: colors.onSurface },
  activityLabel: { fontSize: font.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.lg, paddingVertical: spacing.md },
  infoLabel: { fontSize: font.base, color: colors.onSurfaceSecondary, fontWeight: "600" },
  infoValue: { fontSize: font.base, color: colors.onSurface, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
  tag: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  tagText: { fontSize: font.sm, fontWeight: "700" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
