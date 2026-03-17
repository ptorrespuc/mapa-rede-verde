import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import Toast from "react-native-toast-message";

import { GroupAvatar } from "@/src/components/groups/group-avatar";
import { EventFormModal } from "@/src/components/points/event-form-modal";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LoadingView } from "@/src/components/ui/loading-view";
import { Screen } from "@/src/components/ui/screen";
import {
  createPointEvent,
  getPoint,
  listPointEvents,
  listPointEventTypes,
  reviewPoint,
} from "@/src/lib/api";
import { formatDateTime } from "@/src/lib/format";
import { getPointDisplayStatusLabel } from "@/src/lib/point-display";
import { useAppContext } from "@/src/providers/app-provider";
import { colors, spacing } from "@/src/theme";
import type { PointDetailRecord, PointEventRecord, PointEventTypeRecord } from "@/src/types/domain";

export function PointDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { id } = params;
  const { isReady } = useAppContext();
  const [point, setPoint] = useState<PointDetailRecord | null>(null);
  const [events, setEvents] = useState<PointEventRecord[]>([]);
  const [eventTypeOptions, setEventTypeOptions] = useState<PointEventTypeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);

  const loadPoint = useCallback(async () => {
    if (!id) {
      return;
    }

    setIsLoading(true);

    try {
      const nextPoint = await getPoint(id);
      const [nextEvents, nextEventTypes] = await Promise.all([
        listPointEvents(id),
        listPointEventTypes(nextPoint.classification_id),
      ]);
      setPoint(nextPoint);
      setEvents(nextEvents);
      setEventTypeOptions(nextEventTypes);
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Falha ao abrir ponto",
        text2: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (!isReady) {
        return undefined;
      }

      void loadPoint();
      return undefined;
    }, [isReady, loadPoint]),
  );

  async function handleReview(action: "approve" | "reject") {
    if (!point) {
      return;
    }

    try {
      const updatedPoint = await reviewPoint(point.id, action);
      setPoint(updatedPoint as PointDetailRecord);
      Toast.show({
        type: "success",
        text1:
          action === "approve"
            ? point.has_pending_update
              ? "Alteracao aprovada"
              : "Ponto aprovado"
            : "Ponto rejeitado",
      });
      await loadPoint();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Falha ao revisar ponto",
        text2: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  }

  if (!isReady || isLoading) {
    return <LoadingView label="Carregando detalhe..." />;
  }

  if (!point) {
    return (
      <Screen>
        <EmptyState
          title="Ponto indisponivel"
          description="Este ponto nao foi encontrado ou o seu perfil nao possui acesso a ele."
        />
      </Screen>
    );
  }

  const canReview = point.viewer_can_approve && (point.approval_status === "pending" || point.has_pending_update);

  return (
    <Screen>
      <Card>
        <View style={styles.header}>
          <GroupAvatar logoUrl={point.group_logo_url} name={point.group_name} size={38} />
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{point.title}</Text>
            <Text style={styles.subtitle}>
              {point.group_name} | {point.classification_name}
            </Text>
          </View>
        </View>

        <View style={styles.badges}>
          <Badge tone={point.approval_status === "pending" ? "warning" : "default"}>
            {getPointDisplayStatusLabel(point)}
          </Badge>
          <Badge tone={point.approval_status === "rejected" ? "danger" : point.approval_status === "pending" ? "warning" : "success"}>
            {point.approval_status === "approved"
              ? "Aprovado"
              : point.approval_status === "pending"
                ? "Pendente"
                : "Rejeitado"}
          </Badge>
          <Badge>{point.is_public ? "Publico" : "Privado"}</Badge>
          {point.has_pending_update ? <Badge tone="warning">Alteracao pendente</Badge> : null}
        </View>

        {point.description ? <Text style={styles.description}>{point.description}</Text> : null}

        {point.classification_requires_species && point.species_name ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Especie</Text>
            <Text style={styles.blockValue}>{point.species_name}</Text>
          </View>
        ) : null}

        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Latitude</Text>
            <Text style={styles.metaValue}>{point.latitude.toFixed(6)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Longitude</Text>
            <Text style={styles.metaValue}>{point.longitude.toFixed(6)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Criado em</Text>
            <Text style={styles.metaValue}>{formatDateTime(point.created_at)}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {(point.viewer_can_manage || point.viewer_can_request_update) ? (
            <Button
              label={point.viewer_can_manage ? "Editar ponto" : "Solicitar alteracao"}
              onPress={() => router.push(`/points/${point.id}/edit`)}
              variant="secondary"
            />
          ) : null}
          {canReview ? (
            <>
              <Button label="Aprovar" onPress={() => void handleReview("approve")} variant="secondary" />
              <Button label="Rejeitar" onPress={() => void handleReview("reject")} variant="danger" />
            </>
          ) : null}
          {point.viewer_can_manage ? (
            <Button label="Novo evento" onPress={() => setIsEventModalOpen(true)} variant="ghost" />
          ) : null}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Timeline</Text>
        {events.length ? (
          events.map((event) => (
            <View key={event.id} style={styles.timelineItem}>
              <Text style={styles.timelineType}>{event.event_type}</Text>
              <Text style={styles.timelineMeta}>
                {formatDateTime(event.event_date)} | {event.created_by_name}
              </Text>
              {event.description ? <Text style={styles.timelineDescription}>{event.description}</Text> : null}
            </View>
          ))
        ) : (
          <EmptyState
            title="Sem eventos"
            description="A timeline deste ponto ainda nao recebeu registros."
          />
        )}
      </Card>

      <EventFormModal
        eventTypeOptions={eventTypeOptions}
        onClose={() => setIsEventModalOpen(false)}
        onSubmit={async (payload) => {
          await createPointEvent(point.id, payload);
          Toast.show({
            type: "success",
            text1: "Evento registrado",
          });
          await loadPoint();
        }}
        open={isEventModalOpen}
        pointTitle={point.title}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  block: {
    gap: 2,
  },
  blockLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  blockValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  metaItem: {
    minWidth: 120,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  metaValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  actions: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  timelineItem: {
    borderLeftColor: colors.secondary,
    borderLeftWidth: 3,
    gap: 4,
    paddingLeft: spacing.md,
  },
  timelineType: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  timelineMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  timelineDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
