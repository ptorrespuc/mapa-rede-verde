import { Pressable, StyleSheet, Text } from "react-native";
import type { ComponentProps } from "react";

import { colors, spacing } from "@/src/theme";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends Omit<ComponentProps<typeof Pressable>, "style"> {
  label: string;
  variant?: ButtonVariant;
  compact?: boolean;
}

export function Button({
  label,
  variant = "primary",
  compact = false,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.compact : styles.regular,
        stylesByVariant[variant],
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
      ]}
      {...rest}
    >
      <Text style={[styles.label, labelStylesByVariant[variant]]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
  },
  regular: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  compact: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.84,
  },
  disabled: {
    opacity: 0.5,
  },
});

const stylesByVariant = StyleSheet.create({
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
});

const labelStylesByVariant = StyleSheet.create({
  primary: {
    color: "#ffffff",
  },
  secondary: {
    color: colors.primaryStrong,
  },
  ghost: {
    color: colors.text,
  },
  danger: {
    color: "#ffffff",
  },
});
