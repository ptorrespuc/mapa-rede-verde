import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";

import { Button } from "@/src/components/ui/button";
import {
  Field,
  FieldHint,
  FieldInput,
  FieldLabel,
  FieldSwitch,
  FieldTextArea,
} from "@/src/components/ui/field";
import { colors, spacing } from "@/src/theme";
import type {
  CreatePointPayload,
  GroupRecord,
  PointClassificationRecord,
  SpeciesRecord,
} from "@/src/types/domain";
import { STATUS_OPTIONS } from "@/src/types/domain";

interface PointFormProps {
  groups: GroupRecord[];
  classifications: PointClassificationRecord[];
  speciesCatalog: SpeciesRecord[];
  initialValues?: Partial<CreatePointPayload>;
  submitLabel?: string;
  onCancel?: () => void;
  onSubmit: (payload: CreatePointPayload) => Promise<void>;
}

interface PointFormState {
  groupId: string;
  classificationId: string;
  title: string;
  speciesId: string;
  description: string;
  status: string;
  isPublic: boolean;
  longitude: string;
  latitude: string;
}

function buildInitialState(
  groups: GroupRecord[],
  classifications: PointClassificationRecord[],
  initialValues?: Partial<CreatePointPayload>,
): PointFormState {
  const selectedGroup = groups.find((group) => group.id === initialValues?.groupId) ?? groups[0];
  const selectedClassification =
    classifications.find((classification) => classification.id === initialValues?.classificationId) ??
    classifications[0];
  const isGroupPublic = selectedGroup?.is_public ?? false;

  return {
    groupId: initialValues?.groupId ?? selectedGroup?.id ?? "",
    classificationId: initialValues?.classificationId ?? selectedClassification?.id ?? "",
    title: initialValues?.title ?? "",
    speciesId: initialValues?.speciesId ?? "",
    description: initialValues?.description ?? "",
    status: initialValues?.status ?? "active",
    isPublic: isGroupPublic ? (initialValues?.isPublic ?? true) : false,
    longitude: initialValues?.longitude != null ? String(initialValues.longitude) : "",
    latitude: initialValues?.latitude != null ? String(initialValues.latitude) : "",
  };
}

export function PointForm({
  groups,
  classifications,
  speciesCatalog,
  initialValues,
  submitLabel = "Salvar ponto",
  onCancel,
  onSubmit,
}: PointFormProps) {
  const [formState, setFormState] = useState(() =>
    buildInitialState(groups, classifications, initialValues),
  );
  const [speciesSearch, setSpeciesSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const nextState = buildInitialState(groups, classifications, initialValues);
    setFormState(nextState);
    const nextSpecies = speciesCatalog.find((species) => species.id === nextState.speciesId);
    setSpeciesSearch(nextSpecies?.display_name ?? "");
  }, [classifications, groups, initialValues, speciesCatalog]);

  const selectedGroup = groups.find((group) => group.id === formState.groupId) ?? null;
  const selectedClassification =
    classifications.find((classification) => classification.id === formState.classificationId) ?? null;
  const canConfigureState = selectedGroup?.viewer_can_manage ?? false;
  const pointCanBePublic = selectedGroup?.is_public ?? false;
  const showGroupPicker = groups.length > 1;
  const requiresSpecies = selectedClassification?.requires_species ?? false;
  const filteredSpecies = useMemo(() => {
    const query = speciesSearch.trim().toLowerCase();

    if (!query) {
      return speciesCatalog;
    }

    return speciesCatalog.filter((species) =>
      [species.display_name, species.common_name, species.scientific_name].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [speciesCatalog, speciesSearch]);

  function setField<Key extends keyof PointFormState>(key: Key, value: PointFormState[Key]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    setErrorMessage(null);

    const longitude = Number(formState.longitude);
    const latitude = Number(formState.latitude);

    if (
      !formState.groupId ||
      !formState.classificationId ||
      !formState.title.trim() ||
      Number.isNaN(longitude) ||
      Number.isNaN(latitude)
    ) {
      setErrorMessage("Grupo, classificacao, titulo e coordenadas sao obrigatorios.");
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        groupId: formState.groupId,
        classificationId: formState.classificationId,
        title: formState.title.trim(),
        speciesId: requiresSpecies ? formState.speciesId || undefined : undefined,
        description: formState.description.trim() || undefined,
        status: canConfigureState ? formState.status : "active",
        isPublic: canConfigureState ? (pointCanBePublic ? formState.isPublic : false) : pointCanBePublic,
        longitude,
        latitude,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel salvar o ponto.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.helperBox}>
        <Text style={styles.helperText}>
          O grupo define isolamento e colaboracao. A classificacao controla cor do marcador,
          especies e tipos de evento da timeline.
        </Text>
      </View>

      <Field>
        <FieldLabel>Grupo</FieldLabel>
        {showGroupPicker ? (
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={formState.groupId}
              onValueChange={(value) => {
                const nextGroup = groups.find((group) => group.id === value) ?? null;
                setFormState((current) => ({
                  ...current,
                  groupId: value,
                  isPublic: nextGroup?.is_public ?? false,
                }));
              }}
            >
              {groups.map((group) => (
                <Picker.Item
                  key={group.id}
                  label={`${group.name} (${group.is_public ? "publico" : "privado"})`}
                  value={group.id}
                />
              ))}
            </Picker>
          </View>
        ) : (
          <View style={styles.readOnlyBox}>
            <Text style={styles.readOnlyTitle}>{selectedGroup?.name ?? "Grupo selecionado"}</Text>
            {selectedGroup?.code ? (
              <Text style={styles.readOnlyMeta}>Conta: @{selectedGroup.code}</Text>
            ) : null}
          </View>
        )}
      </Field>

      <Field>
        <FieldLabel>Classificacao do ponto</FieldLabel>
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={formState.classificationId}
            onValueChange={(value) => setField("classificationId", value)}
          >
            {classifications.map((classification) => (
              <Picker.Item key={classification.id} label={classification.name} value={classification.id} />
            ))}
          </Picker>
        </View>
      </Field>

      <Field>
        <FieldLabel>Titulo</FieldLabel>
        <FieldInput
          onChangeText={(value) => setField("title", value)}
          placeholder="Arvore jovem proxima ao portao principal"
          value={formState.title}
        />
      </Field>

      {requiresSpecies ? (
        <Field>
          <FieldLabel>Especie</FieldLabel>
          <FieldInput
            onChangeText={setSpeciesSearch}
            placeholder="Buscar por nome popular ou cientifico"
            value={speciesSearch}
          />
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={formState.speciesId}
              onValueChange={(value) => {
                setField("speciesId", value);
                const nextSpecies = speciesCatalog.find((species) => species.id === value);
                if (nextSpecies) {
                  setSpeciesSearch(nextSpecies.display_name);
                }
              }}
            >
              <Picker.Item label="Selecione uma especie" value="" />
              {filteredSpecies.map((species) => (
                <Picker.Item
                  key={species.id}
                  label={`${species.display_name} | ${species.origin === "exotic" ? "exotica" : "nativa"}`}
                  value={species.id}
                />
              ))}
            </Picker>
          </View>
          <FieldHint>Vincular uma especie ao ponto e opcional.</FieldHint>
        </Field>
      ) : null}

      <Field>
        <FieldLabel>Descricao</FieldLabel>
        <FieldTextArea
          onChangeText={(value) => setField("description", value)}
          placeholder="Observacoes de campo, contexto ou problema encontrado."
          value={formState.description}
        />
      </Field>

      {canConfigureState ? (
        <>
          <Field>
            <FieldLabel>Status</FieldLabel>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={formState.status}
                onValueChange={(value) => setField("status", value)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <Picker.Item key={option.value} label={option.label} value={option.value} />
                ))}
              </Picker>
            </View>
          </Field>
          <FieldSwitch
            label={
              pointCanBePublic
                ? "Ponto publico"
                : "Grupo privado: o ponto sera salvo como privado"
            }
            onValueChange={(value) => setField("isPublic", value)}
            value={pointCanBePublic ? formState.isPublic : false}
          />
        </>
      ) : (
        <View style={styles.helperBox}>
          <Text style={styles.helperText}>
            Pontos enviados em colaboracao entram como ativos e seguem a visibilidade padrao do grupo.
          </Text>
        </View>
      )}

      <View style={styles.coordinateRow}>
        <Field style={styles.coordinateField}>
          <FieldLabel>Longitude</FieldLabel>
          <FieldInput
            keyboardType="numeric"
            onChangeText={(value) => setField("longitude", value)}
            value={formState.longitude}
          />
        </Field>
        <Field style={styles.coordinateField}>
          <FieldLabel>Latitude</FieldLabel>
          <FieldInput
            keyboardType="numeric"
            onChangeText={(value) => setField("latitude", value)}
            value={formState.latitude}
          />
        </Field>
      </View>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <View style={styles.actions}>
        <Button
          disabled={isSubmitting}
          label={isSubmitting ? "Salvando..." : submitLabel}
          onPress={() => void handleSubmit()}
        />
        {onCancel ? <Button label="Cancelar" onPress={onCancel} variant="ghost" /> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  helperBox: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  pickerWrapper: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  readOnlyBox: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
  },
  readOnlyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  readOnlyMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  coordinateRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  coordinateField: {
    flex: 1,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  actions: {
    gap: spacing.sm,
  },
});
