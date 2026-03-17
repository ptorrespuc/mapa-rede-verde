import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";

import { PointSummaryCard } from "@/src/components/points/point-summary-card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field, FieldLabel, FieldSwitch } from "@/src/components/ui/field";
import { LoadingView } from "@/src/components/ui/loading-view";
import { Screen } from "@/src/components/ui/screen";
import { listWorkspacePoints, reviewPoint } from "@/src/lib/api";
import { formatDateTime } from "@/src/lib/format";
import { useAppContext } from "@/src/providers/app-provider";
import { colors, spacing } from "@/src/theme";
import type { PointRecord } from "@/src/types/domain";

export function PointsScreen() {
  const router = useRouter();
  const { classifications, isAuthenticated, isReady, userContext, visibleGroups } = useAppContext();
  const submissionGroups = userContext?.submission_groups ?? [];
  const defaultMineOnly =
    submissionGroups.length > 0 &&
    submissionGroups.every((group) => !group.viewer_can_manage && !group.viewer_can_approve_points);
  const [points, setPoints] = useState<PointRecord[]>([]);
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(defaultMineOnly);
  const [isLoading, setIsLoading] = useState(false);

  const refreshPoints = useCallback(async () => {
    if (!isAuthenticated) {
      setPoints([]);
      return;
    }

    setIsLoading(true);

    try {
      const nextPoints = await listWorkspacePoints({
        classificationId: classificationFilter === "all" ? null : classificationFilter,
        groupId: groupFilter === "all" ? null : groupFilter,
        pendingOnly,
        mineOnly,
      });
      setPoints(nextPoints);
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Falha ao carregar workspace",
        text2: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [classificationFilter, groupFilter, isAuthenticated, mineOnly, pendingOnly]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    void refreshPoints();
  }, [isReady, refreshPoints]);

  const selectedGroup = visibleGroups.find((group) => group.id === groupFilter) ?? null;
  const canCreateForSelectedGroup =
    selectedGroup != null
      ? submissionGroups.some((group) => group.id === selectedGroup.id)
      : submissionGroups.length > 0;
  const pointRows = useMemo(
    () =>
      points.map((point) => ({
        point,
        updatedAtLabel: formatDateTime(point.updated_at),
      })),
    [points],
  );

  async function handleReview(point: PointRecord, action: "approve" | "reject") {
    try {
      await reviewPoint(point.id, action);
      Toast.show({
        type: "success",
        text1:
          action === "approve"
            ? point.has_pending_update
              ? "Alteracao aprovada"
              : "Ponto aprovado"
            : "Ponto rejeitado",
      });
      await refreshPoints();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Falha ao revisar ponto",
        text2: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  }

  if (!isReady) {
    return <LoadingView label="Preparando workspace..." />;
  }

  if (!isAuthenticated || !userContext) {
    return (
      <Screen>
        <EmptyState
          title="Entrar para usar Pontos"
          description="O workspace lista pendencias, pontos proprios e aprovacoes. Faça login para liberar esse modulo."
        />
        <Button label="Ir para login" onPress={() => router.push("/login")} />
      </Screen>
    );
  }

  if (!userContext.has_point_workspace) {
    return (
      <Screen>
        <EmptyState
          title="Workspace indisponivel"
          description="Este perfil ainda nao possui permissao para consultar ou enviar pontos por grupos."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{selectedGroup?.name ?? "Pontos"}</Text>
            <Text style={styles.description}>
              Consulte pendencias, seus registros e os pontos do escopo atual.
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Badge>{isLoading ? "Carregando..." : `${pointRows.length} pontos`}</Badge>
            {canCreateForSelectedGroup ? (
              <Button
                compact
                label="Novo no mapa"
                onPress={() => router.push(selectedGroup?.code ? `/?group=${selectedGroup.code}` : "/")}
                variant="secondary"
              />
            ) : null}
          </View>
        </View>

        <View style={styles.filters}>
          <Field>
            <FieldLabel>Classificacao</FieldLabel>
            <View style={styles.pickerWrapper}>
              <Picker selectedValue={classificationFilter} onValueChange={setClassificationFilter}>
                <Picker.Item label="Todas as classificacoes" value="all" />
                {classifications.map((classification) => (
                  <Picker.Item key={classification.id} label={classification.name} value={classification.id} />
                ))}
              </Picker>
            </View>
          </Field>

          {visibleGroups.length > 1 ? (
            <Field>
              <FieldLabel>Grupo</FieldLabel>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={groupFilter} onValueChange={setGroupFilter}>
                  <Picker.Item label="Todos os grupos visiveis" value="all" />
                  {visibleGroups.map((group) => (
                    <Picker.Item key={group.id} label={group.name} value={group.id} />
                  ))}
                </Picker>
              </View>
            </Field>
          ) : null}

          <FieldSwitch label="Apenas pendentes" onValueChange={setPendingOnly} value={pendingOnly} />
          <FieldSwitch label="Meus pontos" onValueChange={setMineOnly} value={mineOnly} />
        </View>
      </Card>

      {pointRows.length ? (
        pointRows.map(({ point, updatedAtLabel }) => (
          <Card key={point.id}>
            <PointSummaryCard
              meta={`Atualizado em ${updatedAtLabel}`}
              onPress={() => router.push(`/points/${point.id}`)}
              point={point}
            />
            {point.viewer_can_approve && (point.approval_status === "pending" || point.has_pending_update) ? (
              <View style={styles.reviewRow}>
                <Button compact label="Aprovar" onPress={() => void handleReview(point, "approve")} variant="secondary" />
                <Button compact label="Rejeitar" onPress={() => void handleReview(point, "reject")} variant="danger" />
              </View>
            ) : null}
          </Card>
        ))
      ) : (
        <EmptyState
          title="Nenhum ponto encontrado"
          description="Ajuste grupo, classificacao, pendencias ou o filtro de pontos proprios."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  headerCopy: {
    gap: 4,
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
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  filters: {
    gap: spacing.md,
  },
  pickerWrapper: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  reviewRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
