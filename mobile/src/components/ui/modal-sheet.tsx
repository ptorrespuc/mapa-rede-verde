import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { PropsWithChildren } from "react";

import { colors, spacing } from "@/src/theme";

interface ModalSheetProps extends PropsWithChildren {
  open: boolean;
  title: string;
  onClose: () => void;
}

export function ModalSheet({ children, open, title, onClose }: ModalSheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.overlay}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.close}>Fechar</Text>
            </Pressable>
          </View>
          <View style={styles.content}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: "rgba(10, 22, 15, 0.4)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    minHeight: "44%",
    paddingBottom: spacing.xl,
  },
  header: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  close: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
  },
});
