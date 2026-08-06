import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View, TextInput, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { colors, spacing, radius, font } from "@/src/theme";
import { PrimaryButton, Loader } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";
import { brevo } from "@/src/lib/brevo";
import { cache, cacheKeys } from "@/src/lib/cache";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// First-iteration curated field set (Brevo attribute name -> UI).
const FIELDS = [
  { key: "FIRSTNAME", label: "First name", keyboardType: "default" as const, autoCapitalize: "words" as const },
  { key: "LASTNAME", label: "Last name", keyboardType: "default" as const, autoCapitalize: "words" as const },
  { key: "SMS", label: "SMS (phone)", keyboardType: "phone-pad" as const, autoCapitalize: "none" as const },
];

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
  const [values, setValues] = useState<Record<string, string>>({
    FIRSTNAME: "",
    LASTNAME: "",
    SMS: "",
  });
  const [emailError, setEmailError] = useState<string | null>(null);

  // Pre-fill the curated fields with the contact's CURRENT attribute values.
  const load = useCallback(async () => {
    if (!isEdit) return;
    setLoading(true);
    try {
      const c = await brevo.getContact(token, params.id!);
      const a = c?.attributes || {};
      setEmail(c?.email || "");
      setValues({
        FIRSTNAME: a.FIRSTNAME != null ? String(a.FIRSTNAME) : "",
        LASTNAME: a.LASTNAME != null ? String(a.LASTNAME) : "",
        SMS: a.SMS != null ? String(a.SMS) : "",
      });
    } catch (e: any) {
      toast.show(e?.message || "Failed to load contact", "error");
    } finally {
      setLoading(false);
    }
  }, [token, isEdit, params.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const setVal = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  const onSave = async () => {
    setEmailError(null);
    if (!isEdit) {
      if (!email.trim()) {
        setEmailError("Email is required");
        return;
      }
      if (!EMAIL_RE.test(email.trim())) {
        setEmailError("Enter a valid email address");
        return;
      }
    }

    // Only send non-empty values so unchanged/blank fields never wipe data.
    const payloadAttrs: Record<string, string> = {};
    FIELDS.forEach((f) => {
      const v = (values[f.key] || "").trim();
      if (v !== "") payloadAttrs[f.key] = v;
    });

    setSaving(true);
    try {
      if (isEdit) {
        await brevo.updateContact(token, params.id!, { attributes: payloadAttrs });
        cache.del(cacheKeys.contact(params.id!), cacheKeys.contacts);
        toast.show("Contact updated", "success");
      } else {
        await brevo.createContact(token, {
          email: email.trim(),
          attributes: payloadAttrs,
          updateEnabled: true,
        });
        cache.del(cacheKeys.contacts);
        toast.show("Contact created", "success");
      }
      router.back();
    } catch (e: any) {
      toast.show(e?.message || "Failed to save contact", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Modal header */}
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
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Email (read-only in edit) */}
            <Text style={styles.label}>Email {!isEdit ? <Text style={styles.req}>*</Text> : null}</Text>
            <TextInput
              testID="form-email-input"
              style={[styles.input, isEdit && styles.inputDisabled, emailError && styles.inputError]}
              value={email}
              onChangeText={setEmail}
              editable={!isEdit}
              placeholder="name@example.com"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            {isEdit ? <Text style={styles.hint}>Email cannot be changed here.</Text> : null}

            {/* Curated editable fields */}
            {FIELDS.map((f) => (
              <View key={f.key}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput
                  testID={`form-attr-${f.key}`}
                  style={styles.input}
                  value={values[f.key]}
                  onChangeText={(v) => setVal(f.key, v)}
                  placeholder={`Enter ${f.label.toLowerCase()}`}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType={f.keyboardType}
                  autoCapitalize={f.autoCapitalize}
                  autoCorrect={false}
                />
              </View>
            ))}
          </KeyboardAwareScrollView>

          <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
              <PrimaryButton
                title={isEdit ? "Save Changes" : "Create Contact"}
                icon="checkmark"
                onPress={onSave}
                loading={saving}
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
  req: { color: colors.error },
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
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
