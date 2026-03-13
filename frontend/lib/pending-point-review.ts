import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadPointClassifications } from "@/lib/point-classifications";
import { getPendingPointMediaDescriptors } from "@/lib/pending-point-updates";
import { hydratePointMediaRows, listPointMediaRows } from "@/lib/point-timeline";
import type {
  PendingPointReviewChange,
  PendingReviewMediaMode,
  PendingPointReviewSnapshot,
  PendingPointReviewSummary,
  PointDetailRecord,
  PointMediaRecord,
  SpeciesRecord,
} from "@/types/domain";

export async function loadPendingPointReviewSummary(
  supabase: SupabaseClient,
  point: PointDetailRecord,
): Promise<PendingPointReviewSummary | null> {
  if (!point.has_pending_update) {
    return null;
  }

  const [{ data: classifications }, { data: speciesCatalog }, mediaRows] = await Promise.all([
    loadPointClassifications(supabase, true),
    supabase.rpc("list_species", {
      p_only_active: false,
    }),
    listPointMediaRows(supabase, point.id),
  ]);

  const classificationMap = new Map(
    (classifications ?? []).map((classification) => [classification.id, classification.name]),
  );
  const speciesMap = new Map(
    ((speciesCatalog ?? []) as SpeciesRecord[]).map((species) => [species.id, species.display_name]),
  );

  const currentMedia = await hydratePointMediaRows(mediaRows.filter((media) => !media.point_event_id));
  const pendingMedia = await buildPendingMedia(point);
  const pendingMediaMode = resolvePendingMediaMode(point, pendingMedia.length > 0);
  const currentSnapshot = buildCurrentSnapshot(point);
  const proposedSnapshot = buildProposedSnapshot(point, classificationMap, speciesMap);
  const changes = buildChanges(currentSnapshot, proposedSnapshot);
  const resultingMedia = buildResultingMedia(currentMedia, pendingMedia, pendingMediaMode);

  return {
    pointId: point.id,
    requestedAt: point.pending_update_requested_at,
    current: currentSnapshot,
    proposed: proposedSnapshot,
    changes,
    currentMedia,
    pendingMedia,
    resultingMedia,
    pendingMediaMode,
  };
}

async function buildPendingMedia(point: PointDetailRecord) {
  const pendingDescriptors = getPendingPointMediaDescriptors(point.pending_update_data);
  const syntheticRows = pendingDescriptors.map((descriptor, index) => ({
      id: `pending-${index}`,
      point_id: point.id,
      point_event_id: null,
      file_url: descriptor.file_url,
      caption: descriptor.caption,
      created_at: point.pending_update_requested_at ?? point.updated_at,
    }));

  return hydratePointMediaRows(syntheticRows);
}

function resolvePendingMediaMode(point: PointDetailRecord, hasPendingMedia: boolean) {
  if (!hasPendingMedia) {
    return null;
  }

  if (point.pending_update_data?.pending_point_media_mode === "append") {
    return "append";
  }

  if (point.pending_update_data?.pending_point_media_mode === "replace") {
    return "replace";
  }

  return "unspecified";
}

function buildCurrentSnapshot(point: PointDetailRecord): PendingPointReviewSnapshot {
  return {
    groupName: point.group_name,
    classificationName: point.classification_name,
    title: point.title,
    speciesName: point.species_name,
    description: point.description,
    latitude: point.latitude,
    longitude: point.longitude,
    isPublic: point.is_public,
  };
}

function buildProposedSnapshot(
  point: PointDetailRecord,
  classificationMap: Map<string, string>,
  speciesMap: Map<string, string>,
): PendingPointReviewSnapshot {
  const pendingData = point.pending_update_data ?? {};
  const hasDescription = Object.prototype.hasOwnProperty.call(pendingData, "description");
  const hasGroup = Object.prototype.hasOwnProperty.call(pendingData, "group_id");
  const hasIsPublic = Object.prototype.hasOwnProperty.call(pendingData, "is_public");
  const hasSpecies = Object.prototype.hasOwnProperty.call(pendingData, "species_id");

  const nextClassificationId =
    typeof pendingData.classification_id === "string" ? pendingData.classification_id : null;
  const nextSpeciesId = typeof pendingData.species_id === "string" ? pendingData.species_id : null;
  const nextTitle =
    typeof pendingData.title === "string" && pendingData.title.trim()
      ? pendingData.title.trim()
      : point.title;
  const nextDescription = hasDescription ? normalizeTextOrNull(pendingData.description) : point.description;
  const nextLatitude =
    typeof pendingData.latitude === "number" ? pendingData.latitude : point.latitude;
  const nextLongitude =
    typeof pendingData.longitude === "number" ? pendingData.longitude : point.longitude;

  return {
    groupName:
      hasGroup && typeof pendingData.group_name === "string" && pendingData.group_name.trim()
        ? pendingData.group_name.trim()
        : point.group_name,
    classificationName:
      (nextClassificationId ? classificationMap.get(nextClassificationId) : null) ??
      point.classification_name,
    title: nextTitle,
    speciesName: hasSpecies
      ? nextSpeciesId
        ? speciesMap.get(nextSpeciesId) ?? point.species_name
        : null
      : point.species_name,
    description: nextDescription,
    latitude: nextLatitude,
    longitude: nextLongitude,
    isPublic: hasIsPublic && typeof pendingData.is_public === "boolean"
      ? pendingData.is_public
      : point.is_public,
  };
}

function buildChanges(
  current: PendingPointReviewSnapshot,
  proposed: PendingPointReviewSnapshot,
): PendingPointReviewChange[] {
  const changes: PendingPointReviewChange[] = [];

  maybePushChange(changes, "group", "Grupo", current.groupName, proposed.groupName);
  maybePushChange(changes, "classification", "Classificacao", current.classificationName, proposed.classificationName);
  maybePushChange(changes, "title", "Titulo", current.title, proposed.title);
  maybePushChange(
    changes,
    "species",
    "Especie",
    current.speciesName ?? "Sem especie",
    proposed.speciesName ?? "Sem especie",
  );
  maybePushChange(
    changes,
    "description",
    "Descricao",
    current.description ?? "Sem descricao",
    proposed.description ?? "Sem descricao",
  );
  maybePushChange(
    changes,
    "coordinates",
    "Posicao no mapa",
    formatCoordinates(current.latitude, current.longitude),
    formatCoordinates(proposed.latitude, proposed.longitude),
  );
  maybePushChange(
    changes,
    "visibility",
    "Visibilidade",
    current.isPublic ? "Publico" : "Privado",
    proposed.isPublic ? "Publico" : "Privado",
  );

  return changes;
}

function maybePushChange(
  changes: PendingPointReviewChange[],
  field: string,
  label: string,
  currentValue: string,
  nextValue: string,
) {
  if (currentValue === nextValue) {
    return;
  }

  changes.push({
    field,
    label,
    currentValue,
    nextValue,
  });
}

function buildResultingMedia(
  currentMedia: PointMediaRecord[],
  pendingMedia: PointMediaRecord[],
  mode: PendingReviewMediaMode,
) {
  if (!pendingMedia.length) {
    return currentMedia;
  }

  if (mode === "append") {
    return [...currentMedia, ...pendingMedia];
  }

  return pendingMedia;
}

function normalizeTextOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function formatCoordinates(latitude: number, longitude: number) {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}
