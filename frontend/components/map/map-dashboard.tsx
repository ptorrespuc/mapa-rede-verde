"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Eye,
  Filter,
  LocateFixed,
  MapPin,
  Plus,
  Search,
  Shovel,
  TreePine,
  ClipboardCheck,
  Construction,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { MapCanvas, type MapCanvasHandle } from "@/components/map/map-canvas";
import { PointCreationModal } from "@/components/points/point-creation-modal";
import { PointFilters } from "@/components/points/point-filters";
import { PointQuickViewModal } from "@/components/points/point-quick-view-modal";
import { apiClient } from "@/lib/api-client";
import { getPointDisplayColor, isPointPendingForReview } from "@/lib/point-display";
import {
  type CreatePointPayload,
  type GroupRecord,
  type PointClassificationRecord,
  type PointRecord,
  type SpeciesRecord,
} from "@/types/domain";

interface MapDashboardProps {
  initialPoints: PointRecord[];
  initialGroupCode?: string | null;
  initialGroupSelectionWasImplicit?: boolean;
  visibleGroups: GroupRecord[];
  submissionGroups: GroupRecord[];
  approvableGroups: GroupRecord[];
  classifications: PointClassificationRecord[];
  speciesCatalog: SpeciesRecord[];
  speciesAdminHref?: string;
  isAuthenticated: boolean;
}

const POINTS_PER_PAGE = 12;

function getPointCardIcon(point: PointRecord): LucideIcon {
  const fingerprint = `${point.classification_slug} ${point.classification_name}`.toLowerCase();

  if (fingerprint.includes("tree") || fingerprint.includes("arvore")) {
    return TreePine;
  }

  if (fingerprint.includes("pit") || fingerprint.includes("gola") || fingerprint.includes("ciment")) {
    return Construction;
  }

  if (fingerprint.includes("plant") || fingerprint.includes("muda") || fingerprint.includes("plantio")) {
    return Shovel;
  }

  if (fingerprint.includes("inspect") || fingerprint.includes("inspec") || fingerprint.includes("vistoria")) {
    return ClipboardCheck;
  }

  return MapPin;
}

function calculateDistanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(distanceInMeters: number | null) {
  if (distanceInMeters == null) {
    return "ordenado por nome";
  }

  if (distanceInMeters < 1000) {
    return `${Math.round(distanceInMeters)} m`;
  }

  return `${(distanceInMeters / 1000).toFixed(1)} km`;
}

export function MapDashboard({
  initialPoints,
  initialGroupCode,
  initialGroupSelectionWasImplicit = false,
  visibleGroups,
  submissionGroups,
  approvableGroups,
  classifications,
  speciesCatalog,
  speciesAdminHref,
  isAuthenticated,
}: MapDashboardProps) {
  const pathname = usePathname();
  const mapRef = useRef<MapCanvasHandle | null>(null);
  const canCreatePoints = submissionGroups.length > 0;
  const initialSelectedGroup =
    (initialGroupCode
      ? visibleGroups.find((group) => group.code === initialGroupCode)
      : null) ?? null;

  const [points, setPoints] = useState(initialPoints);
  const [focusedPointId, setFocusedPointId] = useState<string | null>(null);
  const [quickViewPoint, setQuickViewPoint] = useState<PointRecord | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>(initialSelectedGroup?.id ?? "all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [isGroupSelectionImplicit, setIsGroupSelectionImplicit] = useState(
    initialGroupSelectionWasImplicit,
  );
  const [isGroupPickerOpen, setIsGroupPickerOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressQuery, setAddressQuery] = useState("");
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isCenteringOnCurrentLocation, setIsCenteringOnCurrentLocation] = useState(false);
  const [page, setPage] = useState(1);
  const [draftValues, setDraftValues] = useState<Partial<CreatePointPayload>>({
    groupId:
      submissionGroups.find((group) => group.id === initialSelectedGroup?.id)?.id ??
      submissionGroups[0]?.id ??
      "",
    classificationId: classifications[0]?.id ?? "",
  });
  const hasHydrated = useRef(false);
  const selectedVisibleGroup = visibleGroups.find((group) => group.id === groupFilter) ?? null;
  const currentGroupSummary =
    selectedVisibleGroup ?? (visibleGroups.length === 1 ? visibleGroups[0] : null);
  const defaultSubmissionGroupId =
    submissionGroups.find((group) => group.id === groupFilter)?.id ?? submissionGroups[0]?.id ?? "";
  const canReviewInCurrentScope =
    groupFilter === "all"
      ? approvableGroups.length > 0
      : approvableGroups.some((group) => group.id === groupFilter);

  useEffect(() => {
    let ignore = false;

    async function loadPoints() {
      setErrorMessage(null);

      try {
        const nextPoints = await apiClient.getPointsWithFilters({
          classificationId: filter,
          groupId: groupFilter,
        });

        if (ignore) {
          return;
        }

        setPoints(nextPoints);
        setQuickViewPoint((current) =>
          current ? nextPoints.find((point) => point.id === current.id) ?? null : null,
        );
        setFocusedPointId((current) =>
          current && nextPoints.some((point) => point.id === current) ? current : null,
        );
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error ? error.message : "Nao foi possivel carregar os pontos.",
          );
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
  }, [filter, groupFilter]);

  useEffect(() => {
    setPage(1);
  }, [filter, groupFilter, pendingOnly, points.length]);

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

  function applyGroupSelection(nextGroupId: string) {
    setGroupFilter(nextGroupId);
    setIsGroupSelectionImplicit(false);
    syncGroupCookie(nextGroupId);
    syncGroupUrl(nextGroupId);
  }

  async function refreshPoints(nextFilter: string, nextGroupFilter: string) {
    const nextPoints = await apiClient.getPointsWithFilters({
      classificationId: nextFilter,
      groupId: nextGroupFilter,
    });
    setPoints(nextPoints);
    return nextPoints;
  }

  async function handleCreatePoint(payload: CreatePointPayload) {
    setErrorMessage(null);

    try {
      const createdPoint = await apiClient.createPoint(payload);
      const nextFilter =
        filter !== "all" && filter !== createdPoint.classification_id ? "all" : filter;
      const nextGroupFilter =
        groupFilter !== "all" && groupFilter !== createdPoint.group_id
          ? createdPoint.group_id
          : groupFilter;

      if (nextFilter !== filter) {
        setFilter(nextFilter);
      }

      if (nextGroupFilter !== groupFilter) {
        applyGroupSelection(nextGroupFilter);
      }

      const nextPoints = await refreshPoints(nextFilter, nextGroupFilter);
      const nextPoint = nextPoints.find((point) => point.id === createdPoint.id) ?? createdPoint;
      setFocusedPointId(nextPoint.id);
      setQuickViewPoint(nextPoint);
      setIsModalOpen(false);
      toast.success(
        createdPoint.approval_status === "pending"
          ? "Ponto enviado para aprovacao."
          : "Ponto criado com sucesso.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel criar o ponto.";
      setErrorMessage(message);
      toast.error(message);
    }
  }

  async function handleReviewPoint(point: PointRecord, action: "approve" | "reject") {
    try {
      const updatedPoint = await apiClient.reviewPoint(point.id, action);
      const nextPoints = await refreshPoints(filter, groupFilter);
      const nextPoint = nextPoints.find((item) => item.id === updatedPoint.id) ?? null;
      const shouldKeepVisible = nextPoint && (!pendingOnly || isPointPendingForReview(nextPoint));

      setQuickViewPoint(shouldKeepVisible ? nextPoint : null);
      setFocusedPointId((current) =>
        shouldKeepVisible ? current : current === point.id ? null : current,
      );

      toast.success(
        action === "approve"
          ? point.has_pending_update
            ? "Alteracao aprovada."
            : "Ponto aprovado."
          : "Ponto rejeitado.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel revisar o ponto.");
    }
  }

  async function handleDeletePoint(point: PointRecord) {
    try {
      await apiClient.deletePoint(point.id);
      await refreshPoints(filter, groupFilter);
      setQuickViewPoint(null);
      setFocusedPointId((current) => (current === point.id ? null : current));
      toast.success("Ponto arquivado com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel arquivar o ponto.");
    }
  }

  async function handleAddressSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!addressQuery.trim()) {
      toast.error("Informe um endereco para buscar.");
      return;
    }

    setIsSearchingAddress(true);

    try {
      const result = await mapRef.current?.searchAddress(addressQuery.trim());

      if (!result?.success) {
        toast.error(result?.message ?? "Nao foi possivel localizar o endereco.");
        return;
      }

      setIsMobileFiltersOpen(false);
      toast.success(result.message ?? "Endereco localizado no mapa.");
    } finally {
      setIsSearchingAddress(false);
    }
  }

  async function handleCenterOnCurrentLocation() {
    setIsCenteringOnCurrentLocation(true);

    try {
      const result = await mapRef.current?.centerOnCurrentLocation();

      if (!result?.success) {
        toast.error(result?.message ?? "Nao foi possivel centralizar o mapa.");
        return;
      }

      toast.success(result.message ?? "Mapa centralizado na sua posicao atual.");
    } finally {
      setIsCenteringOnCurrentLocation(false);
    }
  }

  function openPointModal(point: PointRecord) {
    setQuickViewPoint(point);
  }

  function centerPointOnMap(point: PointRecord) {
    if (focusedPointId === point.id) {
      mapRef.current?.focusPoint(point.id);
      return;
    }

    setFocusedPointId(point.id);
  }

  function handleMapCenterChange(nextCenter: { latitude: number; longitude: number }) {
    setMapCenter((current) => {
      if (
        current &&
        current.latitude === nextCenter.latitude &&
        current.longitude === nextCenter.longitude
      ) {
        return current;
      }

      return nextCenter;
    });
  }

  function openEmptyModal() {
    if (!classifications.length) {
      setErrorMessage("Nao ha classificacoes cadastradas para criar novos pontos.");
      return;
    }

    if (!submissionGroups.length) {
      setErrorMessage(
        isAuthenticated
          ? "Seu usuario nao esta associado a um grupo com permissao para criar pontos."
          : "Faca login para criar pontos.",
      );
      return;
    }

    setDraftValues({
      groupId: defaultSubmissionGroupId,
      classificationId: classifications[0]?.id ?? "",
      isPublic:
        submissionGroups.find((group) => group.id === defaultSubmissionGroupId)?.is_public ?? false,
      longitude: mapCenter?.longitude,
      latitude: mapCenter?.latitude,
    });
    setIsModalOpen(true);
  }

  function handleMapContextMenu(coordinates: { longitude: number; latitude: number }) {
    if (!classifications.length) {
      setErrorMessage("Nao ha classificacoes cadastradas para criar novos pontos.");
      return;
    }

    if (!submissionGroups.length) {
      setErrorMessage(
        isAuthenticated
          ? "Seu usuario nao esta associado a um grupo com permissao para criar pontos."
          : "Faca login para criar pontos com o botao direito no mapa.",
      );
      return;
    }

    setDraftValues({
      groupId: defaultSubmissionGroupId,
      classificationId: classifications[0]?.id ?? "",
      isPublic:
        submissionGroups.find((group) => group.id === defaultSubmissionGroupId)?.is_public ?? false,
      longitude: coordinates.longitude,
      latitude: coordinates.latitude,
    });
    setIsModalOpen(true);
  }

  const filteredPoints = useMemo(() => {
    if (!pendingOnly) {
      return points;
    }

    return points.filter((point) => isPointPendingForReview(point));
  }, [pendingOnly, points]);

  const sortedPoints = useMemo(() => {
    return [...filteredPoints]
      .map((point) => ({
        point,
        distance:
          mapCenter == null
            ? null
            : calculateDistanceMeters(mapCenter, {
                latitude: point.latitude,
                longitude: point.longitude,
              }),
      }))
      .sort((a, b) => {
        if (a.distance != null && b.distance != null && a.distance !== b.distance) {
          return a.distance - b.distance;
        }

        if (a.distance != null && b.distance == null) {
          return -1;
        }

        if (a.distance == null && b.distance != null) {
          return 1;
        }

        return a.point.title.localeCompare(b.point.title, "pt-BR");
      });
  }, [filteredPoints, mapCenter]);

  const totalPages = Math.max(1, Math.ceil(sortedPoints.length / POINTS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedPoints = sortedPoints.slice(
    (safePage - 1) * POINTS_PER_PAGE,
    safePage * POINTS_PER_PAGE,
  );
  const groupHeading = currentGroupSummary?.name ?? "Todos os grupos visiveis";
  const groupSubheading = currentGroupSummary
    ? null
    : `${visibleGroups.length} grupos no filtro atual`;
  const desktopGroupSwitcherLabel =
    groupFilter === "all"
      ? "Todos os grupos visiveis"
      : isGroupSelectionImplicit
        ? "Escolher grupo"
        : "Trocar grupo";
  const mobileGroupSwitcherLabel =
    groupFilter === "all" ? "Grupos" : isGroupSelectionImplicit ? "Escolher" : "Trocar grupo";

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [page, safePage]);

  useEffect(() => {
    setQuickViewPoint((current) =>
      current && filteredPoints.some((point) => point.id === current.id) ? current : null,
    );
    setFocusedPointId((current) =>
      current && filteredPoints.some((point) => point.id === current) ? current : null,
    );
  }, [filteredPoints]);

  return (
    <section className="page-stack map-page">
      <section className="panel map-header-panel">
        <div className="map-header-row compact">
          <div className="map-header-copy compact">
            <p className="eyebrow">Mapa</p>
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
                  className="button-ghost compact"
                  onClick={() => setIsGroupPickerOpen(true)}
                  type="button"
                >
                  <Users aria-hidden="true" size={15} />
                  <span className="desktop-only">{desktopGroupSwitcherLabel}</span>
                  <span className="mobile-only">{mobileGroupSwitcherLabel}</span>
                </button>
                <button
                  className="button-ghost compact map-mobile-tools-toggle"
                  onClick={() => setIsMobileFiltersOpen(true)}
                  type="button"
                >
                  <Filter aria-hidden="true" size={15} />
                  <span className="desktop-only">Filtros e busca</span>
                  <span className="mobile-only">Filtros</span>
                </button>
              </div>
            ) : (
              <div className="map-group-switch-row">
                <button
                  className="button-ghost compact map-mobile-tools-toggle"
                  onClick={() => setIsMobileFiltersOpen(true)}
                  type="button"
                >
                  <Filter aria-hidden="true" size={15} />
                  <span className="desktop-only">Filtros e busca</span>
                  <span className="mobile-only">Filtros</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="map-controls-bar compact">
          <PointFilters classifications={classifications} value={filter} onChange={setFilter} />
          <form className="map-search-form toolbar-field" onSubmit={handleAddressSearch}>
            <label className="toolbar-label" htmlFor="map-address-search">
              <Search aria-hidden="true" size={15} />
              <span>Buscar endereco</span>
            </label>
            <div className="map-search-row">
              <input
                id="map-address-search"
                onChange={(event) => setAddressQuery(event.target.value)}
                placeholder="Rua, bairro, numero ou referencia"
                value={addressQuery}
              />
              <button className="button-ghost" disabled={isSearchingAddress} type="submit">
                <Search aria-hidden="true" size={15} />
                {isSearchingAddress ? "Buscando..." : "Localizar"}
              </button>
            </div>
          </form>
          {canReviewInCurrentScope ? (
            <label className="inline-toggle">
              <input
                checked={pendingOnly}
                onChange={(event) => setPendingOnly(event.target.checked)}
                type="checkbox"
              />
              <span>Exibir somente pontos pendentes</span>
            </label>
          ) : null}
        </div>

        {canCreatePoints ? (
          <div className="map-creation-hint" role="note">
            <span className="desktop-only">
              No computador, clique com o botao direito no mapa para criar um ponto exatamente no local desejado.
            </span>
            <span className="mobile-only">
              No celular, arraste o mapa ate o local desejado e toque em Novo ponto. O ponto sera criado no centro do mapa.
            </span>
          </div>
        ) : null}

        <div className="map-header-actions compact map-header-actions-near-map">
          {canCreatePoints ? (
            <button className="button compact button-map-primary" onClick={openEmptyModal} type="button">
              <Plus aria-hidden="true" size={16} />
              Novo ponto
            </button>
          ) : null}
          <button
            className="button-ghost compact"
            disabled={isCenteringOnCurrentLocation}
            onClick={() => void handleCenterOnCurrentLocation()}
            type="button"
          >
            <LocateFixed aria-hidden="true" size={16} />
            {isCenteringOnCurrentLocation ? "Localizando..." : "Minha posicao"}
          </button>
        </div>
      </section>

      {errorMessage ? <p className="error">{errorMessage}</p> : null}

      <section className="panel map-panel">
        <MapCanvas
          ref={mapRef}
          onCenterChange={handleMapCenterChange}
          onMapContextMenu={handleMapContextMenu}
          onSelectPoint={(point) => {
            setFocusedPointId(point.id);
            setQuickViewPoint(point);
          }}
          points={filteredPoints}
          selectedPointId={focusedPointId}
        />
        {canCreatePoints ? (
          <>
            <div aria-hidden="true" className="map-center-target">
              <span className="map-center-target-dot" />
            </div>
            <div className="map-center-caption mobile-only" role="note">
              Novo ponto usa o centro do mapa
            </div>
          </>
        ) : null}
      </section>

      <section className="list-card stack-md">
        <div className="panel-header">
          <div className="stack-xs">
            <h2 className="section-title">Pontos do filtro</h2>
            <p className="subtitle">
              Ordenados pela distancia em relacao ao centro atual do mapa.
            </p>
          </div>
          <div className="button-row">
            <span className="badge">
              Pagina {safePage} de {totalPages}
            </span>
            <span className="badge">{sortedPoints.length} registros</span>
          </div>
        </div>

        <div className="point-line-list">
          {paginatedPoints.length ? (
            paginatedPoints.map(({ point, distance }) => (
              <article className="point-line-item point-line-card" key={point.id}>
                {(() => {
                  const PointIcon = getPointCardIcon(point);

                  return (
                    <div
                      className="point-line-icon-shell"
                      style={{
                        color: getPointDisplayColor(point),
                        backgroundColor: `${getPointDisplayColor(point)}18`,
                      }}
                    >
                      <PointIcon aria-hidden="true" size={18} />
                    </div>
                  );
                })()}
                <span
                  className="point-line-color"
                  style={{ backgroundColor: getPointDisplayColor(point) }}
                />
                <div className="point-line-main">
                  <div className="point-line-badges">
                    <span className="badge">{point.classification_name}</span>
                    {isPointPendingForReview(point) ? <span className="badge">Pendente</span> : null}
                  </div>
                  <strong className="point-line-title">{point.title}</strong>
                  <div className="point-line-support">
                    <span className="muted point-line-group">{point.group_name}</span>
                    {point.classification_requires_species && point.species_name ? (
                      <span className="muted">{point.species_name}</span>
                    ) : null}
                  </div>
                </div>
                <div className="point-line-metric">
                  <span className="muted">Distancia</span>
                  <strong className="point-line-distance">{formatDistance(distance)}</strong>
                </div>
                <div className="point-line-actions">
                  <button
                    className="button-ghost"
                    onClick={() => centerPointOnMap(point)}
                    type="button"
                  >
                    <LocateFixed aria-hidden="true" size={15} />
                    Centralizar
                  </button>
                  <button className="button-ghost" onClick={() => openPointModal(point)} type="button">
                    <Eye aria-hidden="true" size={15} />
                    Ver resumo
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">Nenhum ponto encontrado para os filtros atuais.</p>
          )}
        </div>

        {sortedPoints.length > POINTS_PER_PAGE ? (
          <div className="pagination-row">
            <button
              className="button-ghost"
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              Anterior
            </button>
            <span className="muted">
              Mostrando {(safePage - 1) * POINTS_PER_PAGE + 1} a{" "}
              {Math.min(safePage * POINTS_PER_PAGE, sortedPoints.length)} de {sortedPoints.length}
            </span>
            <button
              className="button-ghost"
              disabled={safePage >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              type="button"
            >
              Proxima
            </button>
          </div>
        ) : null}
      </section>

      <PointCreationModal
        classifications={classifications}
        groups={submissionGroups}
        initialValues={draftValues}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreatePoint}
        speciesAdminHref={speciesAdminHref}
        speciesCatalog={speciesCatalog}
      />

      <PointQuickViewModal
        onApprove={(point) => handleReviewPoint(point, "approve")}
        onClose={() => setQuickViewPoint(null)}
        onDelete={handleDeletePoint}
        onReject={(point) => handleReviewPoint(point, "reject")}
        point={quickViewPoint}
      />

      {isGroupPickerOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card modal-card-compact stack-md">
            <div className="modal-header">
              <div className="modal-header-top">
                <div className="stack-xs">
                  <h2 className="section-title">Escolher grupo</h2>
                  <p className="subtitle">Troque o escopo visivel do mapa.</p>
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
                  applyGroupSelection("all");
                  setIsGroupPickerOpen(false);
                }}
                type="button"
              >
                <div className="stack-xs">
                  <strong>Todos os grupos visiveis</strong>
                  <span className="muted">Exibe os grupos publicos ou acessiveis no seu perfil.</span>
                </div>
              </button>
              {visibleGroups.map((group) => (
                <button
                  className={`list-row list-row-button${groupFilter === group.id ? " active" : ""}`}
                  key={group.id}
                  onClick={() => {
                    applyGroupSelection(group.id);
                    setIsGroupPickerOpen(false);
                  }}
                  type="button"
                >
                  <div className="stack-xs">
                    <strong>{group.name}</strong>
                    <span className="muted">
                      {group.is_public ? "Grupo publico" : "Grupo privado"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isMobileFiltersOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card modal-card-compact stack-md">
            <div className="modal-header">
              <div className="modal-header-top">
                <div className="stack-xs">
                  <h2 className="section-title">Filtros e busca</h2>
                  <p className="subtitle">Ajuste a classificacao e localize um endereco no mapa.</p>
                </div>
                <button
                  aria-label="Fechar janela"
                  className="modal-close-button"
                  onClick={() => setIsMobileFiltersOpen(false)}
                  type="button"
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
            </div>

            <div className="stack-md">
              <PointFilters classifications={classifications} value={filter} onChange={setFilter} />
              <form className="map-search-form" onSubmit={handleAddressSearch}>
                <label className="toolbar-label" htmlFor="map-address-search-mobile">
                  <Search aria-hidden="true" size={15} />
                  <span>Buscar endereco</span>
                </label>
                <div className="map-search-row">
                  <input
                    id="map-address-search-mobile"
                    onChange={(event) => setAddressQuery(event.target.value)}
                    placeholder="Rua, bairro, numero ou referencia"
                    value={addressQuery}
                  />
                  <button className="button-ghost" disabled={isSearchingAddress} type="submit">
                    <Search aria-hidden="true" size={15} />
                    {isSearchingAddress ? "Buscando..." : "Localizar"}
                  </button>
                </div>
              </form>
              {canReviewInCurrentScope ? (
                <label className="inline-toggle">
                  <input
                    checked={pendingOnly}
                    onChange={(event) => setPendingOnly(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Exibir somente pontos pendentes</span>
                </label>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
