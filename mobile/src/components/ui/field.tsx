import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { ComponentProps, PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { colors, spacing } from "@/src/theme";

interface FieldProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
}

export function Field({ children, style }: FieldProps) {
  return <View style={[styles.field, style]}>{children}</View>;
}

export function FieldLabel({ children }: PropsWithChildren) {
  return <Text style={styles.label}>{children}</Text>;
}

export function FieldHint({ children }: PropsWithChildren) {
  return <Text style={styles.hint}>{children}</Text>;
}

export function FieldInput(props: ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={colors.textMuted} style={styles.input} {...props} />;
}

export function FieldTextArea(props: ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      multiline
      placeholderTextColor={colors.textMuted}
      style={[styles.input, styles.textArea]}
      textAlignVertical="top"
      {...props}
    />
  );
}

interface FieldSwitchProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function FieldSwitch({ label, value, onValueChange }: FieldSwitchProps) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        onValueChange={onValueChange}
        thumbColor="#ffffff"
        trackColor={{ false: "#d8ddd9", true: colors.primary }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  textArea: {
    minHeight: 108,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  switchLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    paddingRight: spacing.md,
  },
});
