"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Users, X } from "lucide-react";
import { toast } from "sonner";

import { PointFilters } from "@/components/points/point-filters";
import { PointMapPreviewTrigger } from "@/components/points/point-map-preview-trigger";
import { PointTagBadges } from "@/components/points/point-tag-badges";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { apiClient } from "@/lib/api-client";
import type { FlashFeedbackPayload } from "@/lib/flash-feedback";
import { getPointDisplayColor, getPointDisplayStatusLabel } from "@/lib/point-display";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";
import type {
  GroupRecord,
  PointClassificationRecord,
  PointRecord,
  PointTagRecord,
} from "@/types/domain";

interface PointsWorkspaceProps {
  initialPoints: PointRecord[];
  initialGroupCode?: string | null;
  initialGroupSelectionWasImplicit?: boolean;
  visibleGroups: GroupRecord[];
  submissionGroups: GroupRecord[];
  approvableGroups: GroupRecord[];
  classifications: PointClassificationRecord[];
  pointTags: PointTagRecord[];
}

export function PointsWorkspace({
  initialPoints,
  initialGroupCode,
  initialGroupSelectionWasImplicit = false,
  visibleGroups,
  submissionGroups,
  approvableGroups,
  classifications,
  pointTags,
}: PointsWorkspaceProps) {
  const pathname = usePathname();
  const initialSelectedGroup =
    (initialGroupCode
      ? visibleGroups.find((group) => group.code === initialGroupCode)
      : null) ?? null;
  const defaultMineOnly =
    submissionGroups.length > 0 &&
    submissionGroups.every((group) => !group.viewer_can_manage && !group.viewer_can_approve_points);

  const [points, setPoints] = useState(initialPoints);
  const [classificationFilter, setClassificationFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>(initialSelectedGroup?.id ?? "all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(defaultMineOnly);
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedSpeciesIds, setSelectedSpeciesIds] = useState<string[]>([]);
  const [isGroupSelectionImplicit, setIsGroupSelectionImplicit] = useState(
    initialGroupSelectionWasImplicit,
  );
  const [isGroupPickerOpen, setIsGroupPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FlashFeedbackPayload | null>(null);
  const hasHydrated = useRef(false);
  const groupPickerModalRef = useModalAccessibility<HTMLDivElement>(
    isGroupPickerOpen,
    () => setIsGroupPickerOpen(false),
  );
  const selectedGroup = visibleGroups.find((group) => group.id === groupFilter) ?? null;
  const currentGroupSummary = selectedGroup ?? (visibleGroups.length === 1 ? visibleGroups[0] : null);
  const groupHeading = currentGroupSummary?.name ?? "Todos os grupos visiveis";
  const groupSubheading = currentGroupSummary
    ? null
    : `${visibleGroups.length} grupos no filtro atual`;
  const canCreateForSelectedGroup =
    (selectedGroup
      ? submissionGroups.some((group) => group.id === selectedGroup.id)
      : submissionGroups.length > 0);
  const hasApprovalScope = approvableGroups.length > 0;
  const visibleTagOptions = useMemo(() => {
    if (classificationFilter === "all") {
      return [] as PointTagRecord[];
    }

    return [...pointTags]
      .filter(
        (tag) => tag.is_active && tag.point_classification_id === classificationFilter,
      )
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [classificationFilter, pointTags]);
  const visibleSpeciesOptions = useMemo(() => {
    const speciesById = new Map<string, { id: string; label: string }>();

    for (const point of points) {
      if (
        (classificationFilter !== "all" && point.classification_id !== classificationFilter) ||
        !point.classification_requires_species ||
        !point.species_id
      ) {
        continue;
      }

      speciesById.set(point.species_id, {
        id: point.species_id,
        label:
          point.species_common_name ??
          point.species_name ??
          point.species_scientific_name ??
          "Especie sem nome",
      });
    }

    return [...speciesById.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [classificationFilter, points]);

  useEffect(() => {
    let ignore = false;

    async function loadPoints() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextPoints = await apiClient.getWorkspacePoints({
          classificationId: classificationFilter,
          groupId: groupFilter,
          pendingOnly,
          mineOnly,
        });

        if (!ignore) {
          setPoints(nextPoints);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error ? error.message : "Nao foi possivel carregar os pontos.",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    if (!hasHydrated.current) {
      hasHydrated.current = true;
      return;
    }

    void loadPoints();

    return () => {
      ignore = true;
    };
  }, [classificationFilter, groupFilter, pendingOnly, mineOnly]);

  useEffect(() => {
    setSelectedTagIds(visibleTagOptions.map((tag) => tag.id));
  }, [visibleTagOptions]);

  useEffect(() => {
    setSelectedSpeciesIds(visibleSpeciesOptions.map((species) => species.id));
  }, [visibleSpeciesOptions]);

  function syncGroupUrl(nextGroupId: string) {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("grupo");
    url.searchParams.delete("group");

    if (nextGroupId !== "all") {
      const nextGroup = visibleGroups.find((group) => group.id === nextGroupId);
      if (nextGroup?.code) {
        url.searchParams.set("grupo", nextGroup.code);
      }
    }

    window.history.replaceState(window.history.state, "", `${pathname}${url.search}`);
  }

  function syncGroupCookie(nextGroupId: string) {
    if (typeof document === "undefined") {
      return;
    }

    const nextGroupCode =
      nextGroupId === "all"
        ? "all"
        : visibleGroups.find((group) => group.id === nextGroupId)?.code ?? "all";

    document.cookie = `map_scope=${encodeURIComponent(nextGroupCode)}; path=/; max-age=31536000; samesite=lax`;
  }

  function handleGroupChange(nextGroupId: string) {
    setGroupFilter(nextGroupId);
    setIsGroupSelectionImplicit(false);
    syncGroupCookie(nextGroupId);
    syncGroupUrl(nextGroupId);
  }

  async function refreshPoints() {
    const nextPoints = await apiClient.getWorkspacePoints({
      classificationId: classificationFilter,
      groupId: groupFilter,
      pendingOnly,
      mineOnly,
    });
    setPoints(nextPoints);
  }

  async function handleReview(pointId: string, action: "approve" | "reject") {
    try {
      const currentPoint = points.find((point) => point.id === pointId);
      await apiClient.reviewPoint(pointId, action);
      toast.success(
        action === "approve"
          ? currentPoint?.has_pending_update
            ? "Alteracao aprovada."
            : "Ponto aprovado."
          : "Revisao concluida.",
      );
      setFeedback({
        title:
          action === "approve"
            ? currentPoint?.has_pending_update
              ? "Alteracao aprovada"
              : "Ponto aprovado"
            : "Ponto rejeitado",
        message:
          action === "approve"
            ? "A listagem ja reflete a decisao tomada para este registro."
            : "O ponto continua visivel apenas para os perfis com acesso de revisao.",
        actionHref: currentPoint ? `/points/${currentPoint.id}` : undefined,
        actionLabel: currentPoint ? "Abrir detalhe" : undefined,
      });
      await refreshPoints();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel revisar o ponto.");
    }
  }

  const pointRows = useMemo(() => {
    const shouldFilterByTags =
      visibleTagOptions.length > 0 && selectedTagIds.length < visibleTagOptions.length;
    const shouldFilterBySpecies =
      visibleSpeciesOptions.length > 0 &&
      selectedSpeciesIds.length < visibleSpeciesOptions.length;

    const matchesTagFilter = (point: PointRecord) => {
      if (!shouldFilterByTags) {
        return true;
      }

      const pointTagIds = (point.tags ?? [])
        .filter((tag) => tag.is_active)
        .map((tag) => tag.id);

      if (!selectedTagIds.length) {
        return false;
      }

      return selectedTagIds.some((tagId) => pointTagIds.includes(tagId));
    };

    const matchesSpeciesFilter = (point: PointRecord) => {
      if (!point.classification_requires_species || !shouldFilterBySpecies) {
        return true;
      }

      if (!selectedSpeciesIds.length) {
        return false;
      }

      return Boolean(point.species_id && selectedSpeciesIds.includes(point.species_id));
    };

    return points.filter((point) => matchesTagFilter(point) && matchesSpeciesFilter(point)).map((point) => ({
      ...point,
      displayStatusLabel: getPointDisplayStatusLabel(point),
      formattedUpdatedAt: new Date(point.updated_at).toLocaleString("pt-BR"),
      approvalLabel:
        point.approval_status === "approved"
          ? "aprovado"
          : point.approval_status === "pending"
          ? "pendente"
            : "rejeitado",
    }));
  }, [points, selectedSpeciesIds, selectedTagIds, visibleSpeciesOptions, visibleTagOptions]);
  const desktopGroupSwitcherLabel =
    groupFilter === "all"
      ? "Todos os grupos visiveis"
      : isGroupSelectionImplicit
        ? "Escolher grupo"
        : "Trocar grupo";
  const mobileGroupSwitcherLabel =
    groupFilter === "all" ? "Grupos" : isGroupSelectionImplicit ? "Escolher" : "Trocar grupo";
  const hasTagRestriction =
    visibleTagOptions.length > 0 && selectedTagIds.length < visibleTagOptions.length;
  const hasSpeciesRestriction =
    visibleSpeciesOptions.length > 0 &&
    selectedSpeciesIds.length < visibleSpeciesOptions.length;
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];

    if (classificationFilter !== "all") {
      const classificationName =
        classifications.find((classification) => classification.id === classificationFilter)?.name ??
        "Classificacao filtrada";
      labels.push(classificationName);
    }

    if (hasSpeciesRestriction) {
      labels.push(
        selectedSpeciesIds.length
          ? `${selectedSpeciesIds.length} especies`
          : "Nenhuma especie",
      );
    }

    if (hasTagRestriction) {
      labels.push(selectedTagIds.length ? `${selectedTagIds.length} tags` : "Nenhuma tag");
    }

    if (pendingOnly) {
      labels.push("Apenas pendentes");
    }

    if (mineOnly !== defaultMineOnly) {
      labels.push(mineOnly ? "Meus pontos" : "Todos os pontos visiveis");
    }

    return labels;
  }, [
    classificationFilter,
    classifications,
    defaultMineOnly,
    hasSpeciesRestriction,
    hasTagRestriction,
    mineOnly,
    pendingOnly,
    selectedSpeciesIds.length,
    selectedTagIds.length,
  ]);

  function handleTagToggle(tagId: string) {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((currentTagId) => currentTagId !== tagId)
        : [...current, tagId],
    );
  }

  function handleSpeciesToggle(speciesId: string) {
    setSelectedSpeciesIds((current) =>
      current.includes(speciesId)
        ? current.filter((currentSpeciesId) => currentSpeciesId !== speciesId)
        : [...current, speciesId],
    );
  }

  function selectAllSpecies() {
    setSelectedSpeciesIds(visibleSpeciesOptions.map((species) => species.id));
  }

  function clearSpeciesSelection() {
    setSelectedSpeciesIds([]);
  }

  function selectAllTags() {
    setSelectedTagIds(visibleTagOptions.map((tag) => tag.id));
  }

  function clearTagSelection() {
    setSelectedTagIds([]);
  }

  function clearWorkspaceFilters() {
    setClassificationFilter("all");
    setPendingOnly(false);
    setMineOnly(defaultMineOnly);
    setSelectedSpeciesIds(visibleSpeciesOptions.map((species) => species.id));
    setSelectedTagIds(visibleTagOptions.map((tag) => tag.id));
  }

  return (
    <section className="page-stack">
      <section className="panel map-header-panel">
        <div className="map-header-row compact">
          <div className="map-header-copy compact">
            <p className="eyebrow">Pontos</p>
            <div className="group-heading-row">
              {currentGroupSummary?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={`Logo de ${currentGroupSummary.name}`}
                  className="group-logo group-logo-large"
                  src={currentGroupSummary.logo_url}
                />
              ) : null}
              <h1>{groupHeading}</h1>
            </div>
            {groupSubheading ? <p className="subtitle map-context-copy">{groupSubheading}</p> : null}
            {visibleGroups.length > 1 ? (
              <div className="map-group-switch-row">
                <button
                  className="button-ghost compact group-switch-button"
                  onClick={() => setIsGroupPickerOpen(true)}
                  type="button"
                >
                  <Users aria-hidden="true" size={15} />
                  <span className="desktop-only">{desktopGroupSwitcherLabel}</span>
                  <span className="mobile-only">{mobileGroupSwitcherLabel}</span>
                </button>
              </div>
            ) : null}
            <p className="subtitle">
              {hasApprovalScope
                ? "Consulte registros, acompanhe pendencias e aprove os pontos do grupo selecionado."
                : "Consulte os pontos do grupo selecionado e acompanhe suas pendencias."}
            </p>
          </div>
          <div className="button-row">
            <span className="badge">{isLoading ? "Carregando..." : `${pointRows.length} pontos`}</span>
            {canCreateForSelectedGroup ? (
              <Link
                className="button-secondary"
                href={
                  selectedGroup?.code
                    ? `/points/new?grupo=${encodeURIComponent(selectedGroup.code)}`
                    : "/points/new"
                }
              >
                Novo ponto
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {feedback ? (
        <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} />
      ) : null}

      <section className="panel stack-md">
        <div className="workspace-quick-filters">
          <PointFilters
            classifications={classifications}
            value={classificationFilter}
            onChange={setClassificationFilter}
          />
          <button
            aria-expanded={isTagFilterOpen}
            className="button-ghost compact"
            onClick={() => setIsTagFilterOpen((current) => !current)}
            type="button"
          >
            {isTagFilterOpen ? "Ocultar filtros avancados" : "Filtros avancados"}
          </button>
          <label className="inline-toggle">
            <input
              checked={pendingOnly}
              onChange={(event) => setPendingOnly(event.target.checked)}
              type="checkbox"
            />
            <span>Apenas pendentes</span>
          </label>
          <label className="inline-toggle">
            <input
              checked={mineOnly}
              onChange={(event) => setMineOnly(event.target.checked)}
              type="checkbox"
            />
            <span>Meus pontos</span>
          </label>
        </div>

        {activeFilterLabels.length ? (
          <div className="filter-summary-bar">
            <div className="stack-xs">
              <strong>Filtros ativos na listagem</strong>
              <div className="filter-summary-badges">
                {activeFilterLabels.map((label) => (
                  <span className="badge" key={label}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="button-row filter-summary-actions">
              <button
                className="button-ghost compact"
                onClick={() => setIsTagFilterOpen(true)}
                type="button"
              >
                Ver filtros
              </button>
              <button
                className="button-ghost compact danger"
                onClick={clearWorkspaceFilters}
                type="button"
              >
                Limpar filtros
              </button>
            </div>
          </div>
        ) : null}

        {isTagFilterOpen ? (
          <div className="surface-subtle point-tag-filter-panel stack-sm">
            <div className="panel-header">
              <div className="stack-xs">
                <strong>Especies</strong>
                <span className="muted">
                  O filtro por especie aparece quando houver pontos de classificacoes que usam especies.
                </span>
              </div>
              {visibleSpeciesOptions.length ? (
                <div className="button-row">
                  <button className="button-ghost compact" onClick={selectAllSpecies} type="button">
                    Marcar todas
                  </button>
                  <button
                    className="button-ghost compact"
                    onClick={clearSpeciesSelection}
                    type="button"
                  >
                    Desmarcar todas
                  </button>
                </div>
              ) : null}
            </div>

            {visibleSpeciesOptions.length ? (
              <div className="point-tag-filter-grid">
                {visibleSpeciesOptions.map((species) => (
                  <label className="inline-toggle point-tag-filter-option" key={species.id}>
                    <input
                      checked={selectedSpeciesIds.includes(species.id)}
                      onChange={() => handleSpeciesToggle(species.id)}
                      type="checkbox"
                    />
                    <span>{species.label}</span>
                  </label>
                ))}
              </div>
            ) : (
              <span className="muted">
                Nenhuma especie disponivel para o filtro atual.
              </span>
            )}

            <div className="panel-header">
              <div className="stack-xs">
                <strong>Tags</strong>
                <span className="muted">
                  {classificationFilter === "all"
                    ? "Escolha uma classificacao para exibir as tags associadas."
                    : "As tags da classificacao selecionada aparecem marcadas por padrao."}
                </span>
              </div>
              {classificationFilter !== "all" && visibleTagOptions.length ? (
                <div className="button-row">
                  <button className="button-ghost compact" onClick={selectAllTags} type="button">
                    Marcar todas
                  </button>
                  <button className="button-ghost compact" onClick={clearTagSelection} type="button">
                    Desmarcar todas
                  </button>
                </div>
              ) : null}
            </div>

            {classificationFilter !== "all" ? (
              visibleTagOptions.length ? (
                <div className="point-tag-filter-grid">
                  {visibleTagOptions.map((tag) => (
                    <label className="inline-toggle point-tag-filter-option" key={tag.id}>
                      <input
                        checked={selectedTagIds.includes(tag.id)}
                        onChange={() => handleTagToggle(tag.id)}
                        type="checkbox"
                      />
                      <span>{tag.name}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <span className="muted">
                  Esta classificacao ainda nao possui tags cadastradas.
                </span>
              )
            ) : null}
          </div>
        ) : null}
      </section>

      {errorMessage ? <p className="error">{errorMessage}</p> : null}

      <section className="list-card stack-md">
        <div className="workspace-point-list">
          {pointRows.length ? (
            pointRows.map((point) => (
              <article className="workspace-point-row" key={point.id}>
                <span
                  className="workspace-point-color"
                  style={{ backgroundColor: getPointDisplayColor(point) }}
                />
                <div className="workspace-point-content">
                  <div className="workspace-point-header">
                    <div className="workspace-point-title-block">
                      <strong className="point-line-title">{point.title}</strong>
                      <div className="workspace-point-meta">
                        <span>{point.group_name}</span>
                        <span>{point.classification_name}</span>
                        {point.classification_requires_species && point.species_name ? (
                          <span>{point.species_name}</span>
                        ) : null}
                        <span>{point.displayStatusLabel}</span>
                      </div>
                    </div>
                    <time className="workspace-point-time" dateTime={point.updated_at}>
                      Atualizado em {point.formattedUpdatedAt}
                    </time>
                  </div>

                  <div className="point-line-badges">
                    <span className="badge">{point.approvalLabel}</span>
                    {point.has_pending_update ? <span className="badge">alteracao pendente</span> : null}
                    {point.viewer_is_creator ? <span className="badge">meu</span> : null}
                  </div>
                  <PointTagBadges
                    className="point-tag-list point-tag-list-compact"
                    limit={3}
                    tags={point.tags}
                  />
                </div>
                <div className="workspace-point-actions">
                  {point.viewer_can_approve &&
                  (point.approval_status === "pending" || point.has_pending_update) ? (
                    <>
                      <button
                        className="button-ghost"
                        onClick={() => void handleReview(point.id, "approve")}
                        type="button"
                      >
                        Aprovar
                      </button>
                      <button
                        className="button-ghost danger"
                        onClick={() => void handleReview(point.id, "reject")}
                        type="button"
                      >
                        Rejeitar
                      </button>
                    </>
                  ) : null}
                  <PointMapPreviewTrigger
                    className="button-ghost icon-button"
                    label={`Visualizar ${point.title} no mapa`}
                    point={point}
                    variant="icon"
                  />
                  <Link className="button-ghost" href={`/points/${point.id}`}>
                    Abrir
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">Nenhum ponto encontrado para os filtros atuais.</p>
          )}
        </div>
      </section>

        {isGroupPickerOpen ? (
        <div aria-modal="true" className="modal-overlay" role="dialog">
          <div className="modal-card modal-card-compact stack-md" ref={groupPickerModalRef} tabIndex={-1}>
            <div className="modal-header">
              <div className="modal-header-top">
                <div className="stack-xs">
                  <h2 className="section-title">Escolher grupo</h2>
                  <p className="subtitle">Troque o escopo visivel da listagem.</p>
                </div>
                <button
                  aria-label="Fechar janela"
                  className="modal-close-button"
                  onClick={() => setIsGroupPickerOpen(false)}
                  type="button"
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
            </div>

            <div className="list">
              <button
                className={`list-row list-row-button${groupFilter === "all" ? " active" : ""}`}
                onClick={() => {
                  handleGroupChange("all");
                  setIsGroupPickerOpen(false);
                }}
                type="button"
              >
                <div className="stack-xs">
                  <strong>Todos os grupos visiveis</strong>
                  <span className="muted">Exibe os grupos acessiveis no seu perfil atual.</span>
                </div>
              </button>
              {visibleGroups.map((group) => (
                <button
                  className={`list-row list-row-button${groupFilter === group.id ? " active" : ""}`}
                  key={group.id}
                  onClick={() => {
                    handleGroupChange(group.id);
                    setIsGroupPickerOpen(false);
                  }}
                  type="button"
                >
                  <div className="stack-xs">
                    <strong>{group.name}</strong>
                    <span className="muted">{group.code}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
