import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View, TextInput, Pressable, Switch } from "react-native";
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

type Attr = { name: string; category: string; type: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useBrevo();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attributes, setAttributes] = useState<Attr[]>([]);
  const [email, setEmail] = useState("");
  const [values, setValues] = useState<Record<string, any>>({});
  const [emailError, setEmailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const attrRes = await brevo.getAttributes(token);
      const normal: Attr[] = (attrRes?.attributes || []).filter(
        (a: Attr) => a.category === "normal" && ["text", "float", "date", "boolean"].includes(a.type)
      );
      setAttributes(normal);

      if (isEdit) {
        const c = await brevo.getContact(token, params.id!);
        setEmail(c.email || "");
        setValues(c.attributes || {});
      }
    } catch (e: any) {
      toast.show(e?.message || "Failed to load form", "error");
    } finally {
      setLoading(false);
    }
  }, [token, isEdit, params.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const setVal = (name: string, v: any) => setValues((prev) => ({ ...prev, [name]: v }));

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

    // Build attributes payload (only non-empty)
    const payloadAttrs: Record<string, any> = {};
    attributes.forEach((a) => {
      const v = values[a.name];
      if (v === undefined || v === null || v === "") return;
      if (a.type === "float") {
        const n = Number(v);
        if (!isNaN(n)) payloadAttrs[a.name] = n;
      } else if (a.type === "boolean") {
        payloadAttrs[a.name] = !!v;
      } else {
        payloadAttrs[a.name] = String(v);
      }
    });

    setSaving(true);
    try {
      if (isEdit) {
        await brevo.updateContact(token, params.id!, { attributes: payloadAttrs });
        // Invalidate caches so the detail + list show the change on refetch.
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
            {/* Email */}
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

            {/* Dynamic attributes */}
            {attributes.map((a) => (
              <View key={a.name}>
                <Text style={styles.label}>{prettyLabel(a.name)}</Text>
                {a.type === "boolean" ? (
                  <View style={styles.switchRow}>
                    <Text style={styles.switchText}>{values[a.name] ? "Yes" : "No"}</Text>
                    <Switch
                      testID={`form-attr-${a.name}`}
                      value={!!values[a.name]}
                      onValueChange={(v) => setVal(a.name, v)}
                      trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
                    />
                  </View>
                ) : (
                  <TextInput
                    testID={`form-attr-${a.name}`}
                    style={styles.input}
                    value={values[a.name] != null ? String(values[a.name]) : ""}
                    onChangeText={(v) => setVal(a.name, v)}
                    placeholder={a.type === "date" ? "YYYY-MM-DD" : `Enter ${prettyLabel(a.name).toLowerCase()}`}
                    placeholderTextColor={colors.onSurfaceTertiary}
                    keyboardType={a.type === "float" ? "numeric" : "default"}
                    autoCapitalize={a.name === "SMS" ? "none" : "sentences"}
                  />
                )}
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

function prettyLabel(name: string) {
  return name
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchText: { fontSize: font.lg, color: colors.onSurface },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
