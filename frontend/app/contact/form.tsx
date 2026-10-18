import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, TextInput, Pressable, Keyboard, BackHandler } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { CountryCode } from "libphonenumber-js";
import { colors, spacing, radius, font } from "@/src/theme";
import { Button, Loader } from "@/src/components/common";
import { PhoneField } from "@/src/components/PhoneInput";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";
import { brevo } from "@/src/lib/brevo";
import { cache, cacheKeys } from "@/src/lib/cache";
import { deviceCountry, splitStored, toE164 } from "@/src/lib/phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXT_ID_MAX = 254;
const IDENTIFIER_HINT = "Fill at least one identifier";

const PHONE_KEYS = ["SMS", "WHATSAPP", "LANDLINE_NUMBER"] as const;
type PhoneKey = (typeof PHONE_KEYS)[number];
type Phone = { country: CountryCode; national: string };
type FieldErrors = Partial<Record<string, string>>;

const PHONE_META: Record<PhoneKey, string> = {
  SMS: "SMS (phone)",
  WHATSAPP: "WhatsApp",
  LANDLINE_NUMBER: "Landline",
};

export default function ContactForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useBrevo();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!params.id;
  const dc = useMemo(() => deviceCountry(), []);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [extId, setExtId] = useState("");
  const [names, setNames] = useState({ FIRSTNAME: "", LASTNAME: "" });
  const [phones, setPhones] = useState<Record<PhoneKey, Phone>>({
    SMS: { country: dc, national: "" },
    WHATSAPP: { country: dc, national: "" },
    LANDLINE_NUMBER: { country: dc, national: "" },
  });
  // Snapshots of loaded values so edit sends only changed fields.
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [initialPhone, setInitialPhone] = useState<Record<PhoneKey, Phone>>({
    SMS: { country: dc, national: "" },
    WHATSAPP: { country: dc, national: "" },
    LANDLINE_NUMBER: { country: dc, national: "" },
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [identifierError, setIdentifierError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const scrollRef = React.useRef<any>(null);
  const scrollToTop = () => scrollRef.current?.scrollTo?.({ y: 0, animated: true });

  const load = useCallback(async () => {
    if (!isEdit) return;
    setLoading(true);
    try {
      const c = await brevo.getContact(token, params.id!);
      const a = c?.attributes || {};
      const loaded: Record<string, string> = {
        email: c?.email || "",
        EXT_ID: c?.ext_id != null ? String(c.ext_id) : "",
        FIRSTNAME: a.FIRSTNAME != null ? String(a.FIRSTNAME) : "",
        LASTNAME: a.LASTNAME != null ? String(a.LASTNAME) : "",
        SMS: a.SMS != null ? String(a.SMS) : "",
        WHATSAPP: a.WHATSAPP != null ? String(a.WHATSAPP) : "",
        LANDLINE_NUMBER: a.LANDLINE_NUMBER != null ? String(a.LANDLINE_NUMBER) : "",
      };
      setEmail(loaded.email);
      setExtId(loaded.EXT_ID);
      setNames({ FIRSTNAME: loaded.FIRSTNAME, LASTNAME: loaded.LASTNAME });
      const split = {
        SMS: splitStored(loaded.SMS, dc),
        WHATSAPP: splitStored(loaded.WHATSAPP, dc),
        LANDLINE_NUMBER: splitStored(loaded.LANDLINE_NUMBER, dc),
      };
      const ph: Record<PhoneKey, Phone> = {
        SMS: { country: split.SMS.country, national: split.SMS.national },
        WHATSAPP: { country: split.WHATSAPP.country, national: split.WHATSAPP.national },
        LANDLINE_NUMBER: { country: split.LANDLINE_NUMBER.country, national: split.LANDLINE_NUMBER.national },
      };
      setPhones(ph);
      setInitialPhone(ph);
      setInitial(loaded);
    } catch (e: any) {
      toast.show(e?.message || "Failed to load contact", "error");
    } finally {
      setLoading(false);
    }
  }, [token, isEdit, params.id, toast, dc]);

  useEffect(() => {
    load();
  }, [load]);

  // Close/back: pop if there's history, otherwise fall back to Contacts so the
  // modal never dead-ends (e.g. opened as the first screen on a deep link).
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/contacts");
  }, [router]);

  // Android hardware back mirrors the X button.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]);

  const clearErr = (key: string) => {
    setFieldErrors((p) => ({ ...p, [key]: undefined }));
    setIdentifierError(false);
    setSaveError(null);
  };
  const setName = (key: "FIRSTNAME" | "LASTNAME", v: string) => setNames((p) => ({ ...p, [key]: v }));
  const setPhoneCountry = (key: PhoneKey, country: CountryCode) =>
    setPhones((p) => ({ ...p, [key]: { ...p[key], country } }));
  const setPhoneNational = (key: PhoneKey, national: string) => {
    setPhones((p) => ({ ...p, [key]: { ...p[key], national } }));
    clearErr(key);
  };

  const phoneChanged = (key: PhoneKey) =>
    phones[key].country !== initialPhone[key].country ||
    phones[key].national.trim() !== initialPhone[key].national.trim();

  const onSave = async () => {
    setFieldErrors({});
    setIdentifierError(false);
    setSaveError(null);
    Keyboard.dismiss();

    const errs: FieldErrors = {};
    if (!isEdit && email.trim() && !EMAIL_RE.test(email.trim())) {
      errs.email = "Enter a valid email address";
    }
    if (extId.length > EXT_ID_MAX) {
      errs.EXT_ID = `External ID must be ${EXT_ID_MAX} characters or less`;
    }

    // Compute each phone's stored value. Create: all fields. Edit: only fields
    // the user changed (so untouched legacy values are never re-validated).
    // A field with only a country code and no number is treated as empty.
    const outputs: Partial<Record<PhoneKey, string>> = {};
    for (const key of PHONE_KEYS) {
      if (isEdit && !phoneChanged(key)) continue;
      const { country, national } = phones[key];
      if (!national.trim()) {
        outputs[key] = "";
        continue;
      }
      const { valid, e164 } = toE164(country, national);
      if (!valid || !e164) {
        errs[key] = "Enter a valid number";
        continue;
      }
      outputs[key] = key === "WHATSAPP" ? e164.replace("+", "") : e164;
    }

    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }

    // Identifier rule (create): email, SMS, WhatsApp, landline or ext_id.
    if (!isEdit) {
      const hasId = !!(
        email.trim() ||
        extId.trim() ||
        PHONE_KEYS.some((k) => phones[k].national.trim())
      );
      if (!hasId) {
        setIdentifierError(true);
        return;
      }
    }

    // Build payload. Create: omit empties. Edit: send only changed fields,
    // sending "" to clear a field the user emptied.
    const attrs: Record<string, string> = {};
    const putText = (key: "FIRSTNAME" | "LASTNAME", raw: string) => {
      const t = raw.trim();
      if (!isEdit) {
        if (t) attrs[key] = t;
        return;
      }
      if (t === (initial[key] || "").trim()) return;
      attrs[key] = t;
    };
    putText("FIRSTNAME", names.FIRSTNAME);
    putText("LASTNAME", names.LASTNAME);
    for (const key of PHONE_KEYS) {
      if (isEdit && !phoneChanged(key)) continue;
      const out = outputs[key] ?? "";
      if (!isEdit) {
        if (out) attrs[key] = out;
      } else {
        attrs[key] = out; // changed on edit: set new value or "" to clear
      }
    }

    const payload: any = {};
    if (!isEdit) {
      if (email.trim()) payload.email = email.trim();
      if (Object.keys(attrs).length) payload.attributes = attrs;
      if (extId.trim()) payload.ext_id = extId.trim();
    } else {
      if (Object.keys(attrs).length) payload.attributes = attrs;
      if (extId.trim() !== (initial.EXT_ID || "").trim()) payload.ext_id = extId.trim();
      if (!payload.attributes && payload.ext_id === undefined) {
        goBack();
        return;
      }
    }

    setSaving(true);
    try {
      if (isEdit) {
        await brevo.updateContact(token, params.id!, payload);
        cache.del(cacheKeys.contact(params.id!), cacheKeys.contacts);
        toast.show("Contact updated", "success");
      } else {
        await brevo.createContact(token, payload);
        cache.del(cacheKeys.contacts);
        toast.show("Contact created", "success");
      }
      goBack();
    } catch (e: any) {
      const status = e?.status;
      const code = e?.brevoCode;
      const msg: string = e?.message || "Couldn't save contact. Please try again.";
      const low = msg.toLowerCase();
      const field = e?.field as string | undefined;
      const KNOWN = ["SMS", "WHATSAPP", "LANDLINE_NUMBER", "EXT_ID"];

      // Backend field-tagged validation (e.g. phone format) -> that field.
      if (status === 400 && field && KNOWN.includes(field)) {
        setFieldErrors({ [field]: msg });
        scrollToTop();
        return;
      }

      // Brevo duplicate -> inline under the matching field (never a toast, which
      // renders behind the form sheet).
      const isDuplicate =
        code === "duplicate_parameter" || low.includes("already associated") || low.includes("already exist");
      if (isDuplicate) {
        if (low.includes("whatsapp")) setFieldErrors({ WHATSAPP: "This WhatsApp number already belongs to another contact." });
        else if (low.includes("landline")) setFieldErrors({ LANDLINE_NUMBER: "This landline already belongs to another contact." });
        else if (low.includes("sms") || low.includes("phone")) setFieldErrors({ SMS: "This phone number already belongs to another contact." });
        else if (low.includes("ext_id") || low.includes("external")) setFieldErrors({ EXT_ID: "This external ID already belongs to another contact." });
        else setFieldErrors({ email: "This email already belongs to another contact." });
        scrollToTop();
        return;
      }

      // Anything else -> error banner at the top of the sheet.
      setSaveError(msg);
      scrollToTop();
    } finally {
      setSaving(false);
    }
  };

  const idHint = identifierError ? IDENTIFIER_HINT : undefined;

  // No session -> never render the form (and never let it call the API without
  // a token). Redirect straight to login. Covers the Android deep-link case
  // where the modal could otherwise surface while logged out.
  if (!token) return <Redirect href="/login" />;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={goBack} hitSlop={12} testID="form-close-button">
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{isEdit ? "Edit Contact" : "New Contact"}</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <Loader />
      ) : (
        <>
          <KeyboardAwareScrollView
            ref={scrollRef}
            bottomOffset={90}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }}
            showsVerticalScrollIndicator={false}
          >
            {saveError ? (
              <View style={styles.banner} testID="form-save-error">
                <Ionicons name="alert-circle" size={20} color={colors.error} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTitle}>{"Couldn't save contact"}</Text>
                  <Text style={styles.bannerText}>{saveError}</Text>
                </View>
              </View>
            ) : null}

            {identifierError ? (
              <View style={styles.banner} testID="identifier-banner">
                <Ionicons name="alert-circle" size={20} color={colors.error} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTitle}>Fill at least one identifier</Text>
                  <Text style={styles.bannerText}>Email, SMS, WhatsApp, Landline or External ID.</Text>
                </View>
              </View>
            ) : null}

            {/* Email (read-only in edit) */}
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="form-email-input"
              style={[styles.input, isEdit && styles.inputDisabled, fieldErrors.email && styles.inputError]}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                clearErr("email");
              }}
              editable={!isEdit}
              placeholder="name@example.com"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            {fieldErrors.email ? <Text style={styles.errorText}>{fieldErrors.email}</Text> : null}
            {!fieldErrors.email && idHint ? <Text style={styles.hint}>{idHint}</Text> : null}
            {isEdit ? <Text style={styles.hint}>Email cannot be changed here.</Text> : null}

            {/* Names */}
            {(["FIRSTNAME", "LASTNAME"] as const).map((key) => (
              <View key={key}>
                <Text style={styles.label}>{key === "FIRSTNAME" ? "First name" : "Last name"}</Text>
                <TextInput
                  testID={`form-attr-${key}`}
                  style={styles.input}
                  value={names[key]}
                  onChangeText={(v) => setName(key, v)}
                  placeholder={`Enter ${key === "FIRSTNAME" ? "first name" : "last name"}`}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
            ))}

            {/* Phones with country picker */}
            {PHONE_KEYS.map((key) => (
              <PhoneField
                key={key}
                label={PHONE_META[key]}
                country={phones[key].country}
                national={phones[key].national}
                onChangeCountry={(c) => setPhoneCountry(key, c)}
                onChangeNational={(v) => setPhoneNational(key, v)}
                error={fieldErrors[key]}
                hint={idHint}
                placeholder="9788824675"
                testIDPrefix={`form-phone-${key}`}
              />
            ))}

            {/* External ID — top-level, max 254 */}
            <View style={styles.labelRow}>
              <Text style={styles.label}>External ID</Text>
              <Text style={styles.counter}>
                {extId.length}/{EXT_ID_MAX}
              </Text>
            </View>
            <TextInput
              testID="form-attr-EXT_ID"
              style={[styles.input, fieldErrors.EXT_ID && styles.inputError]}
              value={extId}
              onChangeText={(v) => {
                setExtId(v);
                clearErr("EXT_ID");
              }}
              maxLength={EXT_ID_MAX}
              placeholder="user_12345"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
            />
            {fieldErrors.EXT_ID ? <Text style={styles.errorText}>{fieldErrors.EXT_ID}</Text> : null}
            {!fieldErrors.EXT_ID && idHint ? <Text style={styles.hint}>{idHint}</Text> : null}
          </KeyboardAwareScrollView>

          <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
              <Button
                variant="primary"
                fullWidth
                title={isEdit ? "Save Changes" : "Create Contact"}
                icon="checkmark"
                onPress={onSave}
                loading={saving}
                disabled={saving}
                testID="save-contact-button"
              />
            </View>
          </KeyboardStickyView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  label: { fontSize: font.base, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm, marginTop: spacing.lg },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  counter: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginTop: spacing.lg },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
    fontSize: font.lg,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputDisabled: { opacity: 0.6 },
  inputError: { borderColor: colors.error },
  errorText: { color: colors.error, fontSize: font.sm, marginTop: spacing.xs },
  hint: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginTop: spacing.xs },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  bannerTitle: { fontSize: font.base, fontWeight: "700", color: colors.error },
  bannerText: { fontSize: font.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
