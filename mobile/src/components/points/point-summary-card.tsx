import { Pressable, StyleSheet, Text, View } from "react-native";

import { Badge } from "@/src/components/ui/badge";
import { Card } from "@/src/components/ui/card";
import { getPointDisplayColor, getPointDisplayStatusLabel, isPointPendingForReview } from "@/src/lib/point-display";
import { colors, spacing } from "@/src/theme";
import type { PointRecord } from "@/src/types/domain";

interface PointSummaryCardProps {
  point: PointRecord;
  meta?: string;
  onPress?: () => void;
  onCenter?: () => void;
}

export function PointSummaryCard({ point, meta, onCenter, onPress }: PointSummaryCardProps) {
  const isPending = isPointPendingForReview(point);

  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={styles.header}>
          <View style={[styles.colorBar, { backgroundColor: getPointDisplayColor(point) }]} />
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{point.title}</Text>
            <Text style={styles.meta}>
              {point.group_name} | {point.classification_name}
            </Text>
          </View>
        </View>

        <View style={styles.badges}>
          <Badge tone={point.approval_status === "pending" ? "warning" : "default"}>
            {getPointDisplayStatusLabel(point)}
          </Badge>
          <Badge tone={point.approval_status === "rejected" ? "danger" : isPending ? "warning" : "success"}>
            {point.approval_status === "approved"
              ? "Aprovado"
              : point.approval_status === "pending"
                ? "Pendente"
                : "Rejeitado"}
          </Badge>
          {point.has_pending_update ? <Badge tone="warning">Alteracao pendente</Badge> : null}
        </View>

        {point.description ? <Text style={styles.description}>{point.description}</Text> : null}

        <View style={styles.footer}>
          <Text style={styles.footerMeta}>{meta ?? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`}</Text>
          {onCenter ? (
            <Pressable onPress={onCenter}>
              <Text style={styles.centerAction}>Centralizar</Text>
            </Pressable>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  colorBar: {
    alignSelf: "stretch",
    borderRadius: 999,
    minHeight: 48,
    width: 6,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  meta: {
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
  footer: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerMeta: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 12,
  },
  centerAction: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
  },
});
