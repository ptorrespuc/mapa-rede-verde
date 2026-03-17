import { StyleSheet, Text, View } from "react-native";

import { GroupAvatar } from "@/src/components/groups/group-avatar";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ModalSheet } from "@/src/components/ui/modal-sheet";
import { getPointDisplayStatusLabel, isPointPendingForReview } from "@/src/lib/point-display";
import { colors, spacing } from "@/src/theme";
import type { PointRecord } from "@/src/types/domain";

interface PointActionModalProps {
  point: PointRecord | null;
  open: boolean;
  onClose: () => void;
  onOpenDetail: (point: PointRecord) => void;
  onEdit?: (point: PointRecord) => void;
  onApprove?: (point: PointRecord) => Promise<void> | void;
  onReject?: (point: PointRecord) => Promise<void> | void;
}

export function PointActionModal({
  point,
  open,
  onClose,
  onOpenDetail,
  onEdit,
  onApprove,
  onReject,
}: PointActionModalProps) {
  if (!point) {
    return null;
  }

  const canReview = point.viewer_can_approve && isPointPendingForReview(point);

  return (
    <ModalSheet onClose={onClose} open={open} title="Ponto selecionado">
      <View style={styles.header}>
        <GroupAvatar logoUrl={point.group_logo_url} name={point.group_name} size={36} />
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
        <Badge tone={point.approval_status === "rejected" ? "danger" : canReview ? "warning" : "success"}>
          {point.approval_status === "approved"
            ? "Aprovado"
            : point.approval_status === "pending"
              ? "Pendente"
              : "Rejeitado"}
        </Badge>
        <Badge>{point.is_public ? "Publico" : "Privado"}</Badge>
      </View>

      {point.description ? <Text style={styles.description}>{point.description}</Text> : null}

      <View style={styles.coordinates}>
        <Text style={styles.coordinateText}>Lat {point.latitude.toFixed(6)}</Text>
        <Text style={styles.coordinateText}>Lng {point.longitude.toFixed(6)}</Text>
      </View>

      <View style={styles.actions}>
        <Button label="Abrir detalhe" onPress={() => onOpenDetail(point)} />
        {point.viewer_can_manage || point.viewer_can_request_update ? (
          <Button
            label={point.viewer_can_manage ? "Editar ponto" : "Solicitar alteracao"}
            onPress={() => onEdit?.(point)}
            variant="secondary"
          />
        ) : null}
        {canReview ? (
          <>
            <Button label="Aprovar" onPress={() => onApprove?.(point)} variant="secondary" />
            <Button label="Rejeitar" onPress={() => onReject?.(point)} variant="danger" />
          </>
        ) : null}
      </View>
    </ModalSheet>
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
    fontSize: 20,
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
  coordinates: {
    flexDirection: "row",
    gap: spacing.md,
  },
  coordinateText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  actions: {
    gap: spacing.sm,
  },
});
