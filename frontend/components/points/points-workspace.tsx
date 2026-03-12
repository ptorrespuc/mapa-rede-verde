"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Users, X } from "lucide-react";
import { toast } from "sonner";

import { PointFilters } from "@/components/points/point-filters";
import { apiClient } from "@/lib/api-client";
import { getPointDisplayColor, getPointDisplayStatusLabel } from "@/lib/point-display";
import type { GroupRecord, PointClassificationRecord, PointRecord } from "@/types/domain";

interface PointsWorkspaceProps {
  initialPoints: PointRecord[];
  initialGroupCode?: string | null;
  initialGroupSelectionWasImplicit?: boolean;
  visibleGroups: GroupRecord[];
  submissionGroups: GroupRecord[];
  approvableGroups: GroupRecord[];
  classifications: PointClassificationRecord[];
}

export function PointsWorkspace({
  initialPoints,
  initialGroupCode,
  initialGroupSelectionWasImplicit = false,
  visibleGroups,
  submissionGroups,
  approvableGroups,
  classifications,
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
  const [isGroupSelectionImplicit, setIsGroupSelectionImplicit] = useState(
    initialGroupSelectionWasImplicit,
  );
  const [isGroupPickerOpen, setIsGroupPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasHydrated = useRef(false);
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
      await refreshPoints();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel revisar o ponto.");
    }
  }

  const pointRows = useMemo(() => {
    return points.map((point) => ({
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
  }, [points]);
  const desktopGroupSwitcherLabel =
    groupFilter === "all"
      ? "Todos os grupos visiveis"
      : isGroupSelectionImplicit
        ? "Escolher grupo"
        : "Trocar grupo";
  const mobileGroupSwitcherLabel =
    groupFilter === "all" ? "Grupos" : isGroupSelectionImplicit ? "Escolher" : "Trocar grupo";

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

      <section className="panel stack-md">
        <div className="map-controls-bar compact">
          <PointFilters
            classifications={classifications}
            value={classificationFilter}
            onChange={setClassificationFilter}
          />
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
          <div className="modal-card modal-card-compact stack-md">
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
