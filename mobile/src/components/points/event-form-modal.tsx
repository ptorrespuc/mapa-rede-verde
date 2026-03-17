import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";

import { Button } from "@/src/components/ui/button";
import {
  Field,
  FieldHint,
  FieldInput,
  FieldLabel,
  FieldTextArea,
} from "@/src/components/ui/field";
import { ModalSheet } from "@/src/components/ui/modal-sheet";
import { colors, spacing } from "@/src/theme";
import type { CreatePointEventPayload, PointEventTypeRecord } from "@/src/types/domain";

interface EventFormModalProps {
  open: boolean;
  pointTitle: string;
  eventTypeOptions: PointEventTypeRecord[];
  onClose: () => void;
  onSubmit: (payload: CreatePointEventPayload) => Promise<void>;
}

export function EventFormModal({
  open,
  pointTitle,
  eventTypeOptions,
  onClose,
  onSubmit,
}: EventFormModalProps) {
  const [pointEventTypeId, setPointEventTypeId] = useState("");
  const [customEventType, setCustomEventType] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPointEventTypeId("");
    setCustomEventType("");
    setDescription("");
    setEventDate(new Date().toISOString().slice(0, 10));
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [open]);

  async function handleSubmit() {
    setErrorMessage(null);

    if (!eventTypeOptions.length && !customEventType.trim()) {
      setErrorMessage("Informe o tipo do evento.");
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        pointEventTypeId: pointEventTypeId || undefined,
        eventType: eventTypeOptions.length ? undefined : customEventType.trim(),
        description: description.trim() || undefined,
        eventDate,
      });
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel salvar o evento.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalSheet onClose={onClose} open={open} title="Novo evento">
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>Registrar evento para {pointTitle}.</Text>

        {eventTypeOptions.length ? (
          <Field>
            <FieldLabel>Tipo de evento</FieldLabel>
            <View style={styles.pickerWrapper}>
              <Picker selectedValue={pointEventTypeId} onValueChange={setPointEventTypeId}>
                <Picker.Item label="Selecione um tipo" value="" />
                {eventTypeOptions.map((eventType) => (
                  <Picker.Item key={eventType.id} label={eventType.name} value={eventType.id} />
                ))}
              </Picker>
            </View>
            <FieldHint>Somente os tipos vinculados a esta classificacao aparecem aqui.</FieldHint>
          </Field>
        ) : (
          <Field>
            <FieldLabel>Tipo de evento</FieldLabel>
            <FieldInput
              onChangeText={setCustomEventType}
              placeholder="Ex.: vistoria, poda, reclassificacao"
              value={customEventType}
            />
          </Field>
        )}

        <Field>
          <FieldLabel>Data do evento</FieldLabel>
          <FieldInput onChangeText={setEventDate} value={eventDate} />
          <FieldHint>Use o formato AAAA-MM-DD.</FieldHint>
        </Field>

        <Field>
          <FieldLabel>Descricao</FieldLabel>
          <FieldTextArea
            onChangeText={setDescription}
            placeholder="Descreva o que aconteceu neste ponto."
            value={description}
          />
        </Field>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <View style={styles.actions}>
          <Button
            disabled={isSubmitting}
            label={isSubmitting ? "Salvando..." : "Salvar evento"}
            onPress={() => void handleSubmit()}
          />
          <Button label="Cancelar" onPress={onClose} variant="ghost" />
        </View>
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  pickerWrapper: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  actions: {
    gap: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
});
