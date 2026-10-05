import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Modal,
  FlatList,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CountryCode } from "libphonenumber-js";
import { colors, spacing, radius, font } from "@/src/theme";
import { countryList, dialCode, CountryItem } from "@/src/lib/phone";

export function PhoneField({
  label,
  country,
  national,
  onChangeCountry,
  onChangeNational,
  error,
  hint,
  testIDPrefix,
  placeholder,
}: {
  label: string;
  country: CountryCode;
  national: string;
  onChangeCountry: (c: CountryCode) => void;
  onChangeNational: (v: string) => void;
  error?: string;
  hint?: string;
  testIDPrefix: string;
  placeholder?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const flag = useMemo(() => countryList().find((c) => c.iso === country)?.flag || "🏳️", [country]);

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.row, error && styles.rowError]}>
        <Pressable
          style={styles.countryBtn}
          onPress={() => {
            Keyboard.dismiss();
            setPickerOpen(true);
          }}
          testID={`${testIDPrefix}-country`}
          accessibilityRole="button"
          accessibilityLabel={`Country code, ${country}, plus ${dialCode(country)}`}
        >
          <Text style={styles.flag}>{flag}</Text>
          <Text style={styles.dial}>+{dialCode(country)}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.onSurfaceSecondary} />
        </Pressable>
        <View style={styles.divider} />
        <TextInput
          testID={`${testIDPrefix}-number`}
          style={styles.numberInput}
          value={national}
          onChangeText={onChangeNational}
          placeholder={placeholder || "Phone number"}
          placeholderTextColor={colors.onSurfaceTertiary}
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <CountryPicker
        visible={pickerOpen}
        selected={country}
        onClose={() => setPickerOpen(false)}
        onSelect={(iso) => {
          onChangeCountry(iso);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

function CountryPicker({
  visible,
  selected,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selected: CountryCode;
  onClose: () => void;
  onSelect: (iso: CountryCode) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const all = useMemo(() => countryList(), []);
  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.includes(q.replace("+", "")) || c.iso.toLowerCase() === q
    );
  }, [all, query]);

  const renderItem = ({ item }: { item: CountryItem }) => (
    <Pressable
      style={styles.pickerRow}
      onPress={() => onSelect(item.iso)}
      testID={`country-option-${item.iso}`}
    >
      <Text style={styles.pickerFlag}>{item.flag}</Text>
      <Text style={styles.pickerName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.pickerCode}>+{item.code}</Text>
      {item.iso === selected ? (
        <Ionicons name="checkmark" size={18} color={colors.brandPrimary} style={{ marginLeft: spacing.sm }} />
      ) : null}
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.pickerContainer, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Select country</Text>
          <Pressable onPress={onClose} hitSlop={12} testID="country-picker-close">
            <Ionicons name="close" size={26} color={colors.onSurface} />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
          <TextInput
            testID="country-search"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search country or code"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <FlatList
          data={data}
          keyExtractor={(c) => c.iso}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: font.base,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    height: 52,
  },
  rowError: { borderColor: colors.error },
  countryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    height: "100%",
  },
  flag: { fontSize: 20 },
  dial: { fontSize: font.base, fontWeight: "600", color: colors.onSurface, marginLeft: 2 },
  divider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.border },
  numberInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    height: "100%",
    fontSize: font.lg,
    color: colors.onSurface,
  },
  errorText: { color: colors.error, fontSize: font.sm, marginTop: spacing.xs },
  hint: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginTop: spacing.xs },
  // Picker
  pickerContainer: { flex: 1, backgroundColor: colors.surface },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  pickerTitle: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: font.base, color: colors.onSurface, paddingVertical: 0 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  pickerFlag: { fontSize: 22, marginRight: spacing.md },
  pickerName: { flex: 1, fontSize: font.base, color: colors.onSurface },
  pickerCode: { fontSize: font.base, color: colors.onSurfaceSecondary, fontWeight: "600" },
});
