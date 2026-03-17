import { StyleSheet, Text, View } from "react-native";

import { LoginPanel } from "@/src/components/auth/login-panel";
import { Screen } from "@/src/components/ui/screen";
import { colors, spacing } from "@/src/theme";

export function LoginScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Mapa Rede Verde</Text>
        <Text style={styles.title}>Acesso ao aplicativo</Text>
        <Text style={styles.description}>
          O app móvel cobre o fluxo operacional de campo. Cadastros administrativos pesados continuam na versão web.
        </Text>
      </View>
      <LoginPanel />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  description: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
});
