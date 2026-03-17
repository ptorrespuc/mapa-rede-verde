import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";

import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Field, FieldInput, FieldLabel } from "@/src/components/ui/field";
import { useAppContext } from "@/src/providers/app-provider";
import { colors, spacing } from "@/src/theme";

interface LoginPanelProps {
  title?: string;
  description?: string;
  autoRedirect?: boolean;
}

export function LoginPanel({
  title = "Entrar",
  description = "Use o mesmo acesso do sistema web para liberar os recursos do grupo.",
  autoRedirect = true,
}: LoginPanelProps) {
  const router = useRouter();
  const { signIn } = useAppContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit() {
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage("Informe email e senha.");
      return;
    }

    setIsSubmitting(true);

    try {
      await signIn(email.trim(), password);
      Toast.show({
        type: "success",
        text1: "Sessao iniciada",
        text2: "Os grupos do seu perfil foram carregados no aplicativo.",
      });

      if (autoRedirect) {
        router.replace("/");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel entrar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

      <Field>
        <FieldLabel>Email</FieldLabel>
        <FieldInput
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="usuario@exemplo.com"
          value={email}
        />
      </Field>

      <Field>
        <FieldLabel>Senha</FieldLabel>
        <FieldInput
          onChangeText={setPassword}
          placeholder="Sua senha"
          secureTextEntry
          value={password}
        />
      </Field>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Button
        disabled={isSubmitting}
        label={isSubmitting ? "Entrando..." : "Entrar"}
        onPress={() => void handleSubmit()}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
});
