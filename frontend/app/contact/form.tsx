import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View, TextInput, Pressable, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { colors, spacing, radius, font } from "@/src/theme";
import { Button, Loader } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";
import { brevo } from "@/src/lib/brevo";
import { cache, cacheKeys } from "@/src/lib/cache";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shown when a create has no usable identifier. Matches Brevo web behaviour:
// any of email / SMS / WhatsApp / landline / external ID is enough.
const IDENTIFIER_MESSAGE = "Add an email, phone number (SMS, WhatsApp or landline) or external ID.";

// Curated field set (Brevo attribute name -> UI). ext_id is TOP-LEVEL.
const FIELDS = [
  { key: "FIRSTNAME", label: "First name", keyboardType: "default" as const, autoCapitalize: "words" as const },
  { key: "LASTNAME", label: "Last name", keyboardType: "default" as const, autoCapitalize: "words" as const },
  { key: "SMS", label: "SMS (phone)", keyboardType: "phone-pad" as const, autoCapitalize: "none" as const },
  { key: "WHATSAPP", label: "WhatsApp", keyboardType: "phone-pad" as const, autoCapitalize: "none" as const },
  { key: "LANDLINE_NUMBER", label: "Landline", keyboardType: "phone-pad" as const, autoCapitalize: "none" as const },
];
type FieldErrors = Partial<Record<string, string>>;

export default function ContactForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useBrevo();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!params.id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [extId, setExtId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({
    FIRSTNAME: "",
    LASTNAME: "",
    SMS: "",
    WHATSAPP: "",
    LANDLINE_NUMBER: "",
  });
  // Snapshot of loaded values so edit sends only changed fields.
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

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
      setValues({
        FIRSTNAME: loaded.FIRSTNAME,
        LASTNAME: loaded.LASTNAME,
        SMS: loaded.SMS,
        WHATSAPP: loaded.WHATSAPP,
        LANDLINE_NUMBER: loaded.LANDLINE_NUMBER,
      });
      setInitial(loaded);
    } catch (e: any) {
      toast.show(e?.message || "Failed to load contact", "error");
    } finally {
      setLoading(false);
    }
  }, [token, isEdit, params.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const setVal = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const currentVal = (key: string) => (key === "EXT_ID" ? extId : key === "email" ? email : values[key]) || "";

  // Normalisers
  const normPhone = (v: string) => {
    const t = v.trim();
    const hasPlus = t.startsWith("+");
    const rest = t.replace(/[^+\d\s]/g, "");
    return hasPlus ? "+" + rest.slice(1).replace(/[^\d\s]/g, "") : rest;
  };
  const normWa = (v: string) => v.replace(/\D/g, "");

  const needsCountryCode = (v: string) => {
    const d = v.replace(/\D/g, "");
    return !(v.trim().startsWith("+") || d.length >= 11);
  };

  // At-least-one-identifier rule (create only): email, SMS, WhatsApp,
  // landline or external ID — same as Brevo web.
  const hasIdentifier = [email, values.SMS, values.WHATSAPP, values.LANDLINE_NUMBER, extId].some(
    (v) => (v || "").trim() !== ""
  );
  const canSave = isEdit || hasIdentifier;

  const onSave = async () => {
    setFieldErrors({});
    setFormError(null);
    Keyboard.dismiss();

    const errs: FieldErrors = {};
    if (!isEdit && email.trim() && !EMAIL_RE.test(email.trim())) {
      errs.email = "Enter a valid email address";
    }
    // Field differs from the loaded value (edit only). Drives "send only
    // changed fields" and lets a cleared field be sent as "" to clear it.
    const isChanged = (key: string) => currentVal(key).trim() !== (initial[key] || "").trim();

    // Country-code checks (inline). On edit only validate a field that's being
    // changed; a cleared (empty) field skips validation so it can be cleared.
    for (const key of ["SMS", "LANDLINE_NUMBER"] as const) {
      if (isEdit && !isChanged(key)) continue;
      const v = values[key].trim();
      if (v && needsCountryCode(v)) errs[key] = `${key === "SMS" ? "SMS" : "Landline"} needs a country code (e.g. +91…).`;
    }
    if (!isEdit || isChanged("WHATSAPP")) {
      const wa = values.WHATSAPP.trim();
      if (wa) {
        const d = wa.replace(/\D/g, "");
        if (!d || needsCountryCode(wa)) errs.WHATSAPP = "WhatsApp needs a country code (digits only, e.g. 4915778559164).";
      }
    }
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    if (!isEdit && !hasIdentifier) {
      setFormError(IDENTIFIER_MESSAGE);
      return;
    }

    // Build attributes. Create: omit empties. Edit: send only changed fields,
    // sending "" for a field the user cleared so Brevo clears it too.
    const attrs: Record<string, string> = {};
    const putAttr = (key: string, raw: string, norm: (s: string) => string) => {
      const t = raw.trim();
      if (!isEdit) {
        if (t !== "") attrs[key] = norm(t);
        return;
      }
      if (!isChanged(key)) return;
      attrs[key] = t === "" ? "" : norm(t);
    };
    putAttr("FIRSTNAME", values.FIRSTNAME, (s) => s.trim());
    putAttr("LASTNAME", values.LASTNAME, (s) => s.trim());
    putAttr("SMS", values.SMS, normPhone);
    putAttr("LANDLINE_NUMBER", values.LANDLINE_NUMBER, normPhone);
    putAttr("WHATSAPP", values.WHATSAPP, normWa);

    const payload: any = {};
    if (!isEdit) {
      if (email.trim()) payload.email = email.trim();
      if (Object.keys(attrs).length) payload.attributes = attrs;
      if (extId.trim()) payload.ext_id = extId.trim();
    } else {
      if (Object.keys(attrs).length) payload.attributes = attrs;
      // ext_id: send when changed, including "" to clear it.
      if (isChanged("EXT_ID")) payload.ext_id = extId.trim();
      // Nothing changed → just close.
      if (!payload.attributes && payload.ext_id === undefined) {
        router.back();
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
      router.back();
    } catch (e: any) {
      const status = e?.upstreamStatus || e?.status;
      const msg: string = e?.message || "Failed to save contact";
      const msgLower = (msg + " " + (e?.detail?.message || "")).toLowerCase();
      const field = e?.detail?.field as string | undefined;
      const KNOWN = ["SMS", "WHATSAPP", "LANDLINE_NUMBER", "EXT_ID"];
      // Map Brevo's 400 to the offending field (backend-tagged field first,
      // then message keywords) for SMS, WhatsApp, Landline and external ID.
      if (status === 400 && field && KNOWN.includes(field)) {
        setFieldErrors({ [field]: msg });
      } else if (status === 400 && msgLower.includes("whatsapp")) {
        setFieldErrors({ WHATSAPP: msg });
      } else if (status === 400 && msgLower.includes("landline")) {
        setFieldErrors({ LANDLINE_NUMBER: msg });
      } else if (status === 400 && msgLower.includes("sms")) {
        setFieldErrors({ SMS: msg });
      } else if (status === 400 && (msgLower.includes("ext_id") || msgLower.includes("external"))) {
        setFieldErrors({ EXT_ID: msg });
      } else {
        toast.show(msg, "error");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="form-close-button">
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
            bottomOffset={90}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Email (read-only in edit) */}
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="form-email-input"
              style={[styles.input, isEdit && styles.inputDisabled, fieldErrors.email && styles.inputError]}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setFieldErrors((p) => ({ ...p, email: undefined }));
              }}
              editable={!isEdit}
              placeholder="name@example.com"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            {fieldErrors.email ? <Text style={styles.errorText}>{fieldErrors.email}</Text> : null}
            {isEdit ? <Text style={styles.hint}>Email cannot be changed here.</Text> : null}

            {/* Names + phones */}
            {FIELDS.map((f) => (
              <View key={f.key}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput
                  testID={`form-attr-${f.key}`}
                  style={[styles.input, fieldErrors[f.key] && styles.inputError]}
                  value={values[f.key]}
                  onChangeText={(v) => setVal(f.key, v)}
                  placeholder={
                    f.keyboardType === "phone-pad" ? "+91 9788824675" : `Enter ${f.label.toLowerCase()}`
                  }
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType={f.keyboardType}
                  autoCapitalize={f.autoCapitalize}
                  autoCorrect={false}
                />
                {fieldErrors[f.key] ? <Text style={styles.errorText}>{fieldErrors[f.key]}</Text> : null}
              </View>
            ))}

            {/* EXT_ID — top-level, alphanumeric */}
            <Text style={styles.label}>External ID</Text>
            <TextInput
              testID="form-attr-EXT_ID"
              style={[styles.input, fieldErrors.EXT_ID && styles.inputError]}
              value={extId}
              onChangeText={(v) => {
                setExtId(v);
                setFieldErrors((p) => ({ ...p, EXT_ID: undefined }));
              }}
              placeholder="user_12345"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
            />
            {fieldErrors.EXT_ID ? <Text style={styles.errorText}>{fieldErrors.EXT_ID}</Text> : null}

            {/* Form-level identifier message (create only) */}
            {!isEdit && !canSave ? (
              <Text style={styles.formError} testID="form-identifier-error">
                {IDENTIFIER_MESSAGE}
              </Text>
            ) : null}
            {formError ? <Text style={styles.formError}>{formError}</Text> : null}
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
                disabled={!canSave}
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
  formError: { color: colors.error, fontSize: font.sm, marginTop: spacing.xl, lineHeight: 18 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
