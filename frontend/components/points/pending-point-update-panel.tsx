import type {
  PointClassificationRecord,
  PointDetailRecord,
  PointMediaRecord,
  SpeciesRecord,
} from "@/types/domain";

interface PendingPointUpdatePanelProps {
  point: PointDetailRecord;
  classifications: PointClassificationRecord[];
  speciesCatalog: SpeciesRecord[];
  pendingMedia: PointMediaRecord[];
}

interface PendingChangeItem {
  label: string;
  currentValue: string;
  nextValue: string;
}

export function PendingPointUpdatePanel({
  point,
  classifications,
  speciesCatalog,
  pendingMedia,
}: PendingPointUpdatePanelProps) {
  const pendingData = point.pending_update_data;

  if (!pendingData || !point.has_pending_update) {
    return null;
  }

  const classificationMap = new Map(
    classifications.map((classification) => [classification.id, classification.name]),
  );
  const speciesMap = new Map(
    speciesCatalog.map((species) => [species.id, species.display_name]),
  );
  const changes = buildPendingChangeItems(point, pendingData, classificationMap, speciesMap);

  if (!changes.length && !pendingMedia.length) {
    return null;
  }

  return (
    <section className="panel stack-md">
      <div className="stack-xs">
        <h2 className="section-title">Alteracoes solicitadas</h2>
        <p className="subtitle">
          Compare o estado atual com os dados enviados para aprovacao antes de revisar o ponto.
        </p>
        {point.pending_update_requested_at ? (
          <span className="muted">
            Solicitacao registrada em{" "}
            {new Date(point.pending_update_requested_at).toLocaleString("pt-BR")}
          </span>
        ) : null}
      </div>

      {changes.length ? (
        <div className="pending-change-list">
          {changes.map((change) => (
            <article className="pending-change-card" key={change.label}>
              <span className="muted">{change.label}</span>
              <div className="pending-change-values">
                <div className="pending-change-column">
                  <span className="muted">Atual</span>
                  <strong>{change.currentValue}</strong>
                </div>
                <div className="pending-change-arrow" aria-hidden="true">
                  {"->"}
                </div>
                <div className="pending-change-column">
                  <span className="muted">Solicitado</span>
                  <strong>{change.nextValue}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {pendingMedia.length ? (
        <div className="stack-sm">
          <div className="point-meta">
            <span className="badge">
              {pendingData.pending_point_media_mode === "append"
                ? "novas fotos para adicionar"
                : "fotos para substituir"}
            </span>
          </div>
          <div className="point-photo-gallery">
            {pendingMedia.map((media) => (
              <article className="point-photo-card" key={media.id}>
                {media.signed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={media.caption || `Foto pendente do ponto ${point.title}`}
                    className="point-photo-thumb"
                    loading="lazy"
                    src={media.signed_url}
                  />
                ) : (
                  <div className="point-photo-thumb-placeholder">Imagem indisponivel</div>
                )}
                {media.caption ? <span className="muted">{media.caption}</span> : null}
                {media.signed_url ? (
                  <div className="form-actions">
                    <a
                      className="button-ghost"
                      download
                      href={media.signed_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Baixar imagem
                    </a>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function buildPendingChangeItems(
  point: PointDetailRecord,
  pendingData: Record<string, unknown>,
  classificationMap: Map<string, string>,
  speciesMap: Map<string, string>,
) {
  const changes: PendingChangeItem[] = [];

  const pendingClassificationId =
    typeof pendingData.classification_id === "string" ? pendingData.classification_id : null;
  if (pendingClassificationId && pendingClassificationId !== point.classification_id) {
    changes.push({
      label: "Classificacao",
      currentValue: point.classification_name,
      nextValue:
        classificationMap.get(pendingClassificationId) ?? "Classificacao selecionada",
    });
  }

  const pendingTitle = normalizeOptionalText(pendingData.title);
  if (pendingTitle !== null && pendingTitle !== point.title) {
    changes.push({
      label: "Titulo",
      currentValue: point.title,
      nextValue: pendingTitle,
    });
  }

  if (Object.prototype.hasOwnProperty.call(pendingData, "species_id")) {
    const pendingSpeciesId =
      typeof pendingData.species_id === "string" ? pendingData.species_id : null;
    const currentSpeciesId = point.species_id ?? null;

    if (pendingSpeciesId !== currentSpeciesId) {
      changes.push({
        label: "Especie",
        currentValue: getSpeciesLabel(point.species_id, point.species_name, speciesMap),
        nextValue: getSpeciesLabel(pendingSpeciesId, null, speciesMap),
      });
    }
  }

  const pendingDescription = normalizeNullableText(pendingData.description);
  const currentDescription = normalizeNullableText(point.description);
  if (pendingDescription !== null && pendingDescription !== currentDescription) {
    changes.push({
      label: "Descricao",
      currentValue: currentDescription ?? "Sem descricao",
      nextValue: pendingDescription ?? "Sem descricao",
    });
  }

  const pendingLongitude =
    typeof pendingData.longitude === "number" ? pendingData.longitude : null;
  const pendingLatitude =
    typeof pendingData.latitude === "number" ? pendingData.latitude : null;

  if (
    pendingLongitude !== null &&
    pendingLatitude !== null &&
    (Math.abs(pendingLongitude - point.longitude) > 0.0000001 ||
      Math.abs(pendingLatitude - point.latitude) > 0.0000001)
  ) {
    changes.push({
      label: "Posicao no mapa",
      currentValue: formatCoordinates(point.latitude, point.longitude),
      nextValue: formatCoordinates(pendingLatitude, pendingLongitude),
    });
  }

  if (
    typeof pendingData.is_public === "boolean" &&
    pendingData.is_public !== point.is_public
  ) {
    changes.push({
      label: "Visibilidade",
      currentValue: point.is_public ? "Publico" : "Privado",
      nextValue: pendingData.is_public ? "Publico" : "Privado",
    });
  }

  return changes;
}

function getSpeciesLabel(
  speciesId: string | null | undefined,
  fallbackName: string | null | undefined,
  speciesMap: Map<string, string>,
) {
  if (!speciesId) {
    return "Sem especie";
  }

  return speciesMap.get(speciesId) ?? fallbackName ?? "Especie selecionada";
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : null;
}

function normalizeNullableText(value: unknown) {
  if (typeof value !== "string") {
    return value === null ? null : null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatCoordinates(latitude: number, longitude: number) {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}
