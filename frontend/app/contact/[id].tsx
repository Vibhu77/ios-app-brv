import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, fonts } from "@/src/theme";
import { Avatar, StateView, Loader, Button } from "@/src/components/common";
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
  // Deep link / reload: the saved session restores after first focus, so load once it arrives.
  const hadToken = React.useRef(!!token);
  useEffect(() => {
    if (token && !hadToken.current) {
      hadToken.current = true;
      load();
    }
  }, [token, load]);

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
  const title = name || contact?.email || attrs.SMS || attrs.WHATSAPP || attrs.LANDLINE_NUMBER || "Contact";
  const channels = [
    contact?.email ? "Email" : null,
    attrs.SMS ? "SMS" : null,
    attrs.WHATSAPP ? "WhatsApp" : null,
    attrs.LANDLINE_NUMBER ? "Landline" : null,
  ].filter(Boolean) as string[];
  const received = count(stats?.messagesSent);
  const opened = count(stats?.opened);
  const clicked = count(stats?.clicked);
  const noActivity = received + opened + clicked === 0;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/contacts");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.backLink} testID="header-back-button">
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.linkText}>Contacts</Text>
        </Pressable>
        {contact ? (
          <Pressable
            onPress={() => router.push({ pathname: "/contact/form", params: { id: String(contact.id) } })}
            hitSlop={12}
            style={styles.editBtn}
            testID="edit-contact-button"
          >
            <Text style={[styles.linkText, { fontFamily: fonts.semibold }]}>Edit</Text>
          </Pressable>
        ) : null}
      </View>
      {loading ? (
        <Loader />
      ) : error ? (
        <StateView
          icon="cloud-offline-outline"
          title="Couldn't load contact"
          message={error}
          actionLabel="Retry"
          onAction={load}
          testID="contact-detail-error"
        />
      ) : (
        <>
          <ScrollView
            testID="contact-detail-scroll"
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.profile}>
              <Avatar label={title} size={80} colorId={contact?.id} />
              <Text style={styles.title} testID="contact-title">
                {title}
              </Text>
              {name && contact?.email ? <Text style={styles.subtitle}>{contact.email}</Text> : null}
              <View style={styles.badges}>
                {contact?.emailBlacklisted ? <Tag label="Email unsubscribed" tone="error" /> : null}
                {contact?.smsBlacklisted ? <Tag label="SMS unsubscribed" tone="error" /> : null}
                {!contact?.emailBlacklisted && !contact?.smsBlacklisted ? <Tag label="Subscribed" tone="success" /> : null}
              </View>
            </View>

            {/* Activity (contact stats default to the last 90 days) */}
            <Text style={styles.section}>
              Activity <Text style={styles.sectionMuted}>· last 90 days</Text>
            </Text>
            <View style={styles.activityCard} testID="contact-activity">
              <ActivityCell label="Received" value={nf(received)} testID="activity-received" />
              <View style={styles.vDivider} />
              <ActivityCell label="Opened" value={nf(opened)} testID="activity-opened" />
              <View style={styles.vDivider} />
              <ActivityCell label="Clicked" value={nf(clicked)} testID="activity-clicked" />
            </View>
            {noActivity ? (
              <Text style={styles.emptyHistory} testID="activity-empty">
                No activity yet. It appears here after this contact receives a campaign.
              </Text>
            ) : null}

            {/* Per-campaign timeline */}
            {events.length > 0 ? (
              <>
                <Text style={styles.section}>Recent history</Text>
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
              </>
            ) : null}

            {/* Contact info */}
            <Text style={styles.section}>Contact info</Text>
            <View style={styles.listCard} testID="contact-info">
              <InfoField label="Email" value={contact?.email || "—"} />
              <View style={[styles.field, styles.rowDivider]}>
                <Text style={styles.fieldLabel}>Channels</Text>
                {channels.length ? (
                  <View style={styles.chanRow}>
                    {channels.map((c) => (
                      <View key={c} style={styles.chanTag}>
                        <Text style={styles.chanText}>{c}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.fieldValue}>—</Text>
                )}
              </View>
              <InfoField label="Contact ID" value={String(contact?.id ?? "—")} divider />
              <InfoField label="Created" value={fmtDate(contact?.createdAt)} divider />
              <InfoField label="Modified" value={fmtDate(contact?.modifiedAt)} divider />
            </View>

            {/* Attributes */}
            {attrKeys.length > 0 ? (
              <>
                <Text style={styles.section}>Attributes</Text>
                <View style={styles.listCard}>
                  {attrKeys.map((k, i) => (
                    <InfoField key={k} label={k} value={String(attrs[k])} divider={i > 0} />
                  ))}
                </View>
              </>
            ) : null}

            <View style={{ height: spacing.xl }} />
            <Button
              variant="destructiveOutline"
              fullWidth
              title="Delete contact"
              icon="trash-outline"
              onPress={() => {
                setDeleteError(null);
                setConfirmOpen(true);
              }}
              testID="delete-contact-button"
            />
          </ScrollView>

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

function InfoField({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <View style={[styles.field, divider && styles.rowDivider]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} selectable>
        {value}
      </Text>
    </View>
  );
}

function ActivityCell({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.activityCell} testID={testID}>
      <Text style={styles.activityValue}>{value}</Text>
      <Text style={styles.activityLabel}>{label}</Text>
    </View>
  );
}

function Tag({ label, tone }: { label: string; tone: "success" | "error" }) {
  const map = {
    success: { bg: colors.successBg, fg: colors.successText, dot: colors.success, border: colors.successBorder },
    error: { bg: colors.errorBg, fg: colors.errorText, dot: colors.error, border: colors.errorBorder },
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: map.bg, borderColor: map.border }]}>
      <View style={[styles.tagDot, { backgroundColor: map.dot }]} />
      <Text style={[styles.tagText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg },
  backLink: { flexDirection: "row", alignItems: "center", minHeight: 44, marginLeft: -6 },
  editBtn: { minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  linkText: { fontSize: font.lg, color: colors.accent, fontFamily: fonts.medium },
  profile: { alignItems: "center", paddingTop: spacing.sm, paddingBottom: spacing.sm },
  title: { fontSize: font.xl + 2, fontFamily: fonts.bold, color: colors.onSurface, marginTop: spacing.md, textAlign: "center" },
  subtitle: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: 2, textAlign: "center" },
  badges: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md },
  section: { fontSize: font.lg + 2, fontFamily: fonts.bold, color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.md },
  sectionMuted: { fontSize: font.base, fontFamily: fonts.medium, color: colors.onSurfaceSecondary },
  activityCard: { flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: "hidden" },
  activityCell: { flex: 1, alignItems: "center", paddingVertical: spacing.md },
  vDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  activityValue: { fontSize: font.xxl, fontFamily: fonts.bold, color: colors.onSurface },
  activityLabel: { fontSize: font.sm + 1, color: colors.onSurfaceSecondary, marginTop: 2 },
  emptyHistory: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: spacing.md, lineHeight: 20 },
  timeline: { marginTop: spacing.xs },
  tlRow: { flexDirection: "row", gap: spacing.md },
  tlGutter: { width: 12, alignItems: "center" },
  tlDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  tlLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  tlBody: { flex: 1, paddingBottom: spacing.lg },
  tlLabel: { fontSize: font.base, color: colors.onSurface, lineHeight: 20 },
  tlEvent: { fontFamily: fonts.semibold, color: colors.onSurface },
  tlDate: { fontSize: font.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  listCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: "hidden" },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  field: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 4 },
  fieldLabel: { fontSize: font.base, color: colors.onSurfaceSecondary },
  fieldValue: { fontSize: font.base + 1, color: colors.onSurface },
  chanRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 2 },
  chanTag: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  chanText: { fontSize: font.sm + 1, fontFamily: fonts.semibold, color: colors.onSurfaceSecondary },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontSize: font.sm, fontFamily: fonts.semibold },
});
