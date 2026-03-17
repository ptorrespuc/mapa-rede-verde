import { StyleSheet, Text, View } from "react-native";
import type { PropsWithChildren } from "react";

import { colors, spacing } from "@/src/theme";

interface BadgeProps extends PropsWithChildren {
  tone?: "default" | "warning" | "success" | "danger";
}

export function Badge({ children, tone = "default" }: BadgeProps) {
  return (
    <View style={[styles.base, tones[tone]]}>
      <Text style={[styles.label, toneLabels[tone]]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
});

const tones = StyleSheet.create({
  default: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
  },
  warning: {
    backgroundColor: "#f8efc6",
    borderColor: "#e3c95a",
  },
  success: {
    backgroundColor: "#e0f0e4",
    borderColor: "#86b290",
  },
  danger: {
    backgroundColor: "#f5dfdf",
    borderColor: "#d09393",
  },
});

const toneLabels = StyleSheet.create({
  default: {
    color: colors.textMuted,
  },
  warning: {
    color: "#8a6c18",
  },
  success: {
    color: colors.primaryStrong,
  },
  danger: {
    color: colors.danger,
  },
});
