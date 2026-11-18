import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

interface ReclassificationSnapshotPoint {
  title: string;
  species_name: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  classification_name: string;
}

export function buildReclassificationEventDescription(
  previousPoint: ReclassificationSnapshotPoint,
  nextClassificationName: string,
  preservePreviousState: boolean,
) {
  const summary = `Classificação alterada de ${previousPoint.classification_name} para ${nextClassificationName}.`;

  if (!preservePreviousState) {
    return summary;
  }

  const details = [
    `Título anterior: ${previousPoint.title}`,
    previousPoint.species_name ? `Espécie anterior: ${previousPoint.species_name}` : null,
    previousPoint.description?.trim()
      ? `Descrição anterior: ${previousPoint.description.trim()}`
      : null,
    `Posição anterior: ${previousPoint.latitude.toFixed(6)}, ${previousPoint.longitude.toFixed(6)}`,
  ].filter((item): item is string => Boolean(item));

  return `${summary}\n\nEstado anterior preservado:\n- ${details.join("\n- ")}`;
}

export async function updatePointEventDescription(pointEventId: string, description: string) {
  const adminSupabase = createAdminSupabaseClient();
  const { error } = await adminSupabase
    .from("point_events")
    .update({ description })
    .eq("id", pointEventId);

  if (error) {
    throw error;
  }
}
