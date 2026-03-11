import type { PointClassificationRecord } from "@/types/domain";

type RpcError = { message: string } | null;

interface RpcCapableClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError }>;
}

export function normalizePointClassification(
  classification: Partial<PointClassificationRecord>,
): PointClassificationRecord {
  return {
    id: classification.id ?? "",
    slug: classification.slug ?? "",
    name: classification.name ?? "",
    requires_species: Boolean(classification.requires_species),
    is_active: classification.is_active ?? true,
    marker_color: classification.marker_color ?? "#6a5a91",
    created_at: classification.created_at ?? "",
    updated_at: classification.updated_at ?? "",
    event_type_count: Number(classification.event_type_count ?? 0),
  };
}

export function normalizePointClassifications(
  classifications: Partial<PointClassificationRecord>[] | null | undefined,
) {
  return (classifications ?? []).map(normalizePointClassification);
}

export async function loadPointClassifications(
  supabase: RpcCapableClient,
  includeInactive = false,
) {
  const response = await supabase.rpc("list_point_classifications", {
    p_only_active: includeInactive ? false : true,
  });

  if (!response.error) {
    return {
      data: normalizePointClassifications(
        response.data as Partial<PointClassificationRecord>[] | null | undefined,
      ),
      error: null,
    };
  }

  if (shouldRetryClassificationListWithoutFlag(response.error.message)) {
    const fallbackResponse = await supabase.rpc("list_point_classifications");

    return {
      data: fallbackResponse.error
        ? null
        : normalizePointClassifications(
            fallbackResponse.data as Partial<PointClassificationRecord>[] | null | undefined,
          ),
      error: fallbackResponse.error,
    };
  }

  return {
    data: null,
    error: response.error,
  };
}

function shouldRetryClassificationListWithoutFlag(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("list_point_classifications") && normalized.includes("does not exist");
}
