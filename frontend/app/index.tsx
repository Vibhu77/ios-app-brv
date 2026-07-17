import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { colors } from "@/src/theme";
import { useBrevo } from "@/src/context/BrevoContext";

export default function Index() {
  const { token, loading } = useBrevo();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  return <Redirect href={token ? "/campaigns" : "/login"} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
