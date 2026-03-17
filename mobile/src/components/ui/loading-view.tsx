import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/src/theme";

interface LoadingViewProps {
  label?: string;
}

export function LoadingView({ label = "Carregando..." }: LoadingViewProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 240,
  },
  label: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
