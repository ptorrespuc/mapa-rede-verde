import type { PointTagRecord } from "@/types/domain";

type RpcError = { message: string } | null;

interface RpcCapableClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError }>;
}

interface PointTagAssignmentRow {
  point_id: string;
  tag_id: string;
  point_classification_id: string;
  point_classification_name?: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface PointTagListRow {
  id: string;
  point_classification_id: string;
  point_classification_name?: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface PointTagAttachable {
  id: string;
  classification_id: string;
  tags?: PointTagRecord[];
}

export function normalizePointTag(tag: Partial<PointTagRecord>): PointTagRecord {
  return {
    id: tag.id ?? "",
    point_classification_id: tag.point_classification_id ?? "",
    point_classification_name: tag.point_classification_name,
    slug: tag.slug ?? "",
    name: tag.name ?? "",
    description: tag.description ?? null,
    is_active: tag.is_active ?? true,
    created_at: tag.created_at,
    updated_at: tag.updated_at,
  };
}

export async function loadPointTags(
  supabase: RpcCapableClient,
  options?: { pointClassificationId?: string | null; onlyActive?: boolean },
) {
  const { data, error } = await supabase.rpc("list_point_tags", {
    p_point_classification_id: options?.pointClassificationId ?? null,
    p_only_active: options?.onlyActive ?? true,
  });

  if (error) {
    return { data: null, error };
  }

  return {
    data: ((data ?? []) as PointTagListRow[]).map((tag) => normalizePointTag(tag)),
    error: null,
  };
}

export async function attachPointTagsToPoints<T extends PointTagAttachable>(
  supabase: RpcCapableClient,
  points: T[],
): Promise<Array<T & { tags: PointTagRecord[] }>> {
  if (!points.length) {
    return points.map((point) => ({
      ...point,
      tags: point.tags ?? [],
    }));
  }

  const pointIds = Array.from(new Set(points.map((point) => point.id)));
  const { data, error } = await supabase.rpc("list_point_tag_assignments", {
    p_point_ids: pointIds,
  });

  if (error) {
    if (!shouldIgnoreTagLookupError(error.message)) {
      console.error("[point-tags-load]", {
        errorMessage: error.message,
        pointCount: pointIds.length,
      });
    }

    return points.map((point) => ({
      ...point,
      tags: point.tags ?? [],
    }));
  }

  const rows = ((data ?? []) as PointTagAssignmentRow[]).map((row) => ({
    point_id: row.point_id,
    tag: normalizePointTag({
      id: row.tag_id,
      point_classification_id: row.point_classification_id,
      point_classification_name: row.point_classification_name,
      slug: row.slug,
      name: row.name,
      description: row.description,
      is_active: row.is_active,
    }),
  }));

  const tagsByPointId = new Map<string, PointTagRecord[]>();

  for (const row of rows) {
    const current = tagsByPointId.get(row.point_id) ?? [];
    current.push(row.tag);
    tagsByPointId.set(row.point_id, current);
  }

  return points.map((point) => ({
    ...point,
    tags: tagsByPointId.get(point.id) ?? point.tags ?? [],
  }));
}

export async function attachPointTagsToPoint<T extends PointTagAttachable>(
  supabase: RpcCapableClient,
  point: T,
): Promise<T & { tags: PointTagRecord[] }> {
  const [enrichedPoint] = await attachPointTagsToPoints(supabase, [point]);
  return enrichedPoint;
}

function shouldIgnoreTagLookupError(message: string) {
  const normalized = message.toLowerCase();

  return (
    (normalized.includes("list_point_tag_assignments") && normalized.includes("does not exist")) ||
    (normalized.includes("point_tag_assignments") && normalized.includes("does not exist")) ||
    (normalized.includes("point_tags") && normalized.includes("does not exist"))
  );
}
