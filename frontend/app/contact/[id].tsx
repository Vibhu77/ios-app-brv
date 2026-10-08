import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, fonts } from "@/src/theme";
import { GlassHeader } from "@/src/components/Header";
import { Avatar, StateView, Loader, Card, Button } from "@/src/components/common";
import { ConfirmDialog } from "@/src/components/ConfirmDialog";
import { useToast } from "@/src/context/ToastContext";
import { useBrevo } from "@/src/context/BrevoContext";
import { brevo, Contact, Campaign } from "@/src/lib/brevo";
import { cache, cacheKeys } from "@/src/lib/cache";
import { useFocusRefetch } from "@/src/hooks/use-focus-refetch";
import { fmtDate, nf, relTime } from "@/src/lib/format";

type TimelineEvent = { type: string; label: string; color: string; campaignId?: number; eventTime: string };

// Flatten campaignStats into a single chronological event list (desc).
function flattenEvents(stats: any): TimelineEvent[] {
  if (!stats) return [];
  const out: TimelineEvent[] = [];
  const push = (arr: any, type: string, label: string, color: string) =>
    (Array.isArray(arr) ? arr : []).forEach((e: any) => {
      if (e?.eventTime) out.push({ type, label, color, campaignId: e.campaignId, eventTime: e.eventTime });
    });
  push(stats.delivered ?? stats.messagesSent, "delivered", "Delivered", colors.success);
  push(stats.opened, "opened", "Opened", colors.accent);
  push(stats.clicked, "clicked", "Clicked", colors.accent);
  push(stats.softBounces, "bounced", "Bounced", colors.error);
  push(stats.hardBounces, "bounced", "Bounced", colors.error);
  const uns = stats.unsubscriptions;
  if (uns) {
    push(uns.userUnsubscription, "unsubscribed", "Unsubscribed", colors.warning);
    push(uns.adminUnsubscription, "unsubscribed", "Unsubscribed", colors.warning);
  }
  out.sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());
  return out.slice(0, 40);
}

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
  const toast = useToast();
  const [contact, setContact] = useState<Contact | null>(() => cache.get<Contact>(cacheKeys.contact(id)) || null);
  const [stats, setStats] = useState<any>(() => cache.get<any>(cacheKeys.contactStats(id)) ?? null);
  const [loading, setLoading] = useState(!cache.get<Contact>(cacheKeys.contact(id)));
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const c = await brevo.getContact(token, id);
      setContact(c);
      cache.set(cacheKeys.contact(id), c);
      try {
        const s = await brevo.getContactStats(token, id);
        setStats(s);
        cache.set(cacheKeys.contactStats(id), s);
      } catch {
        setStats(null);
      }
    } catch (e: any) {
      if (!cache.get<Contact>(cacheKeys.contact(id))) setError(e?.message || "Failed to load contact");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useFocusRefetch(load);

  // Remove the contact locally + from caches, then return to the list. Brevo's
  // deletion is async (a few minutes), so we also record the id in a "deleted"
  // set the list filters out until the backend catches up.
  const finishDelete = useCallback(() => {
    setConfirmOpen(false);
    const cid = contact?.id;
    if (cid != null) {
      const cached = cache.get<{ list: Contact[]; total: number | null; hasMore: boolean }>(cacheKeys.contacts);
      if (cached) {
        cache.set(cacheKeys.contacts, {
          ...cached,
          list: cached.list.filter((c) => c.id !== cid),
          total: cached.total != null ? Math.max(0, cached.total - 1) : cached.total,
        });
      }
      const deleted = cache.get<(string | number)[]>(cacheKeys.contactsDeleted) || [];
      if (!deleted.includes(cid)) cache.set(cacheKeys.contactsDeleted, [...deleted, cid]);
      cache.del(cacheKeys.contact(String(cid)), cacheKeys.contactStats(String(cid)));
    }
    toast.show("Deleting this contact. It can take a few minutes", "success");
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/contacts");
  }, [contact?.id, router, toast]);

  const onDelete = useCallback(async () => {
    if (!contact?.id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await brevo.deleteContact(token, contact.id);
      finishDelete();
    } catch (e: any) {
      if (e?.status === 404) {
        finishDelete(); // already gone — treat as success
      } else if (e?.status === 405) {
        setDeleteError("This is your account's login email, so it can't be deleted.");
      } else {
        setDeleteError(e?.message || "Couldn't delete this contact. Please try again.");
      }
    } finally {
      setDeleting(false);
    }
  }, [contact?.id, token, finishDelete]);

  const events = useMemo(() => flattenEvents(stats), [stats]);
  const [names, setNames] = useState<Record<string, string>>({});

  // Resolve campaignId -> name from cache, else fetch + cache.
  useEffect(() => {
    if (!events.length || !token) return;
    const ids = [...new Set(events.map((e) => String(e.campaignId)).filter((x) => x && x !== "undefined"))];
    const cachedList = cache.get<Campaign[]>(cacheKeys.campaigns) || [];
    const resolved: Record<string, string> = {};
    const toFetch: string[] = [];
    ids.forEach((cid) => {
      const inList = cachedList.find((c) => String(c.id) === cid);
      const inCache = cache.get<Campaign>(cacheKeys.campaign(cid));
      const n = inList?.name || inCache?.name;
      if (n) resolved[cid] = n;
      else toFetch.push(cid);
    });
    if (Object.keys(resolved).length) setNames((prev) => ({ ...resolved, ...prev }));
    let cancelled = false;
    toFetch.forEach(async (cid) => {
      try {
        const c = await brevo.getCampaign(token, cid);
        if (cancelled) return;
        cache.set(cacheKeys.campaign(cid), c);
        setNames((prev) => ({ ...prev, [cid]: c.name }));
      } catch {
        /* leave as fallback label */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [events, token]);

  const campaignLabel = (cid?: number) => names[String(cid)] || (cid ? `Campaign #${cid}` : "Campaign");

  const name = contactName(contact);
  const attrs = contact?.attributes || {};
  const attrKeys = Object.keys(attrs).filter((k) => attrs[k] !== "" && attrs[k] != null);

  return (
    <View style={styles.container}>
      <GlassHeader
        title={name || "Contact"}
        onBack={() => {
          console.log("[contact-detail] back pressed, canGoBack =", router.canGoBack());
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace("/(tabs)/contacts");
          }
        }}
      />
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

            {/* Recent history timeline */}
            <Text style={styles.section}>Recent history</Text>
            {events.length === 0 ? (
              <Text style={styles.emptyHistory}>No recent activity yet.</Text>
            ) : (
              <View style={styles.timeline}>
                {events.map((e, i) => (
                  <View key={`${e.type}-${i}`} style={styles.tlRow}>
                    <View style={styles.tlGutter}>
                      <View style={[styles.tlDot, { backgroundColor: e.color }]} />
                      {i < events.length - 1 ? <View style={styles.tlLine} /> : null}
                    </View>
                    <View style={styles.tlBody}>
                      <Text style={styles.tlLabel} numberOfLines={2}>
                        <Text style={styles.tlEvent}>{e.label}</Text>
                        {"  ·  "}
                        {campaignLabel(e.campaignId)}
                      </Text>
                      <Text style={styles.tlDate}>{relTime(e.eventTime)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

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
            <Button
              variant="primary"
              fullWidth
              title="Edit Contact"
              icon="create-outline"
              onPress={() => router.push({ pathname: "/contact/form", params: { id: String(contact?.id) } })}
              testID="edit-contact-button"
            />
            <View style={{ height: spacing.sm }} />
            <Button
              variant="destructiveGhost"
              fullWidth
              title="Delete contact"
              icon="trash-outline"
              onPress={() => {
                setDeleteError(null);
                setConfirmOpen(true);
              }}
              testID="delete-contact-button"
            />
          </View>

          <ConfirmDialog
            visible={confirmOpen}
            icon="trash-outline"
            destructive
            title="Delete this contact?"
            body={`${
              contact?.email ||
              name ||
              attrs.SMS ||
              attrs.WHATSAPP ||
              attrs.LANDLINE_NUMBER ||
              "This contact"
            } will be permanently removed from your Brevo contacts. This action cannot be undone.`}
            confirmLabel="Delete contact"
            cancelLabel="Keep contact"
            busy={deleting}
            errorText={deleteError || undefined}
            onConfirm={onDelete}
            onCancel={() => setConfirmOpen(false)}
            testID="delete-contact-modal"
          />
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
    success: { bg: colors.successBg, fg: colors.successText },
    error: { bg: colors.errorBg, fg: colors.errorText },
    warning: { bg: colors.warningBg, fg: colors.warningText },
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
  emptyHistory: { fontSize: font.base, color: colors.onSurfaceTertiary },
  timeline: { marginTop: spacing.xs },
  tlRow: { flexDirection: "row", gap: spacing.md },
  tlGutter: { width: 12, alignItems: "center" },
  tlDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  tlLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  tlBody: { flex: 1, paddingBottom: spacing.lg },
  tlLabel: { fontSize: font.base, color: colors.onSurface, lineHeight: 20 },
  tlEvent: { fontFamily: fonts.semibold, color: colors.onSurface },
  tlDate: { fontSize: font.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
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
