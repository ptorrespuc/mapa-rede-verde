"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Eye,
  Filter,
  List as ListIcon,
  Map as MapIcon,
  Maximize2,
  Pencil,
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
import { PointEditDrawer } from "@/components/points/point-edit-drawer";
import { PointQuickViewModal } from "@/components/points/point-quick-view-modal";
import { PointTagBadges } from "@/components/points/point-tag-badges";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { apiClient } from "@/lib/api-client";
import type { FlashFeedbackPayload } from "@/lib/flash-feedback";
import {
  loadMapFilters,
  saveMapFilters,
  syncMapUrl,
  type MapViewState,
} from "@/lib/map-view-state";
import { getPointDisplayColor, isPointPendingForReview } from "@/lib/point-display";
import { describePointUpdate } from "@/lib/point-update";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";
import {
  type CreatePointPayload,
  type GroupRecord,
  type PointClassificationRecord,
  type PointRecord,
  type PointTagRecord,
  type SpeciesRecord,
} from "@/types/domain";

interface MapDashboardProps {
  initialPoints: PointRecord[];
  initialGroupCode?: string | null;
  initialGroupSelectionWasImplicit?: boolean;
  /** Posicao vinda da URL (lat/lng/z). */
  initialView?: MapViewState | null;
  /** Ponto selecionado vindo da URL (?ponto=). */
  initialPointId?: string | null;
  visibleGroups: GroupRecord[];
  submissionGroups: GroupRecord[];
  approvableGroups: GroupRecord[];
  classifications: PointClassificationRecord[];
  pointTags: PointTagRecord[];
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
  initialView = null,
  initialPointId = null,
  visibleGroups,
  submissionGroups,
  approvableGroups,
  classifications,
  pointTags,
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
  const initialFocusedPoint =
    (initialPointId ? initialPoints.find((point) => point.id === initialPointId) : null) ?? null;
  const [focusedPointId, setFocusedPointId] = useState<string | null>(
    initialFocusedPoint?.id ?? null,
  );
  // Sem posicao na URL, mas com ponto (ex.: link de notificacao): abre centrado no ponto.
  const [startView] = useState<MapViewState | null>(
    initialView ??
      (initialFocusedPoint
        ? {
            latitude: initialFocusedPoint.latitude,
            longitude: initialFocusedPoint.longitude,
            zoom: 17,
          }
        : null),
  );
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [fitRequestKey, setFitRequestKey] = useState(0);
  const listSectionRef = useRef<HTMLElement | null>(null);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const filtersRestoredRef = useRef(false);
  const [quickViewPoint, setQuickViewPoint] = useState<PointRecord | null>(null);
  const activeClassificationIds = useMemo(() => {
    const active = classifications.filter((classification) => classification.is_active);
    return (active.length ? active : classifications).map((classification) => classification.id);
  }, [classifications]);
  const [selectedClassificationIds, setSelectedClassificationIds] = useState<string[]>(
    activeClassificationIds,
  );
  const [groupFilter, setGroupFilter] = useState<string>(initialSelectedGroup?.id ?? "all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [isGroupSelectionImplicit, setIsGroupSelectionImplicit] = useState(
    initialGroupSelectionWasImplicit,
  );
  const [isGroupPickerOpen, setIsGroupPickerOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedSpeciesIds, setSelectedSpeciesIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FlashFeedbackPayload | null>(null);
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
  const groupPickerModalRef = useModalAccessibility<HTMLDivElement>(
    isGroupPickerOpen,
    () => setIsGroupPickerOpen(false),
  );
  const filtersModalRef = useModalAccessibility<HTMLDivElement>(
    isFiltersOpen,
    () => setIsFiltersOpen(false),
  );
  const selectedVisibleGroup = visibleGroups.find((group) => group.id === groupFilter) ?? null;
  const currentGroupSummary =
    selectedVisibleGroup ?? (visibleGroups.length === 1 ? visibleGroups[0] : null);
  const defaultSubmissionGroupId =
    submissionGroups.find((group) => group.id === groupFilter)?.id ?? submissionGroups[0]?.id ?? "";
  const canReviewInCurrentScope =
    groupFilter === "all"
      ? approvableGroups.length > 0
      : approvableGroups.some((group) => group.id === groupFilter);
  const visibleTagOptions = useMemo(() => {
    if (!selectedClassificationIds.length) {
      return [] as PointTagRecord[];
    }

    return [...pointTags]
      .filter(
        (tag) =>
          tag.is_active && selectedClassificationIds.includes(tag.point_classification_id),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [pointTags, selectedClassificationIds]);
  const visibleSpeciesOptions = useMemo(() => {
    if (!selectedClassificationIds.length) {
      return [] as Array<{ id: string; label: string }>;
    }

    const speciesById = new Map<string, { id: string; label: string }>();

    for (const point of points) {
      if (
        !selectedClassificationIds.includes(point.classification_id) ||
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
          "Espécie sem nome",
      });
    }

    return [...speciesById.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [points, selectedClassificationIds]);

  useEffect(() => {
    let ignore = false;

    async function loadPoints() {
      setErrorMessage(null);

      try {
        const nextPoints = await apiClient.getPointsWithFilters({
          groupId: groupFilter,
        });

        if (ignore) {
          return;
        }

        setPoints(nextPoints);
        // Trocar de grupo muda a area de interesse: reenquadra nos pontos do novo grupo.
        setFitRequestKey((current) => current + 1);
        setQuickViewPoint((current) =>
          current ? nextPoints.find((point) => point.id === current.id) ?? null : null,
        );
        setFocusedPointId((current) =>
          current && nextPoints.some((point) => point.id === current) ? current : null,
        );
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error ? error.message : "Não foi possível carregar os pontos.",
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
  }, [groupFilter]);

  useEffect(() => {
    setSelectedTagIds(visibleTagOptions.map((tag) => tag.id));
  }, [visibleTagOptions]);

  useEffect(() => {
    setSelectedSpeciesIds(visibleSpeciesOptions.map((species) => species.id));
  }, [visibleSpeciesOptions]);

  useEffect(() => {
    setPage(1);
  }, [
    groupFilter,
    mineOnly,
    pendingOnly,
    points.length,
    selectedClassificationIds,
    selectedSpeciesIds,
    selectedTagIds,
  ]);

  // Restaura os filtros rapidos da aba (classificacoes, pendentes, meus pontos).
  useEffect(() => {
    const stored = loadMapFilters();

    if (stored) {
      const knownIds = new Set(classifications.map((classification) => classification.id));
      const restoredIds = stored.classificationIds.filter((id) => knownIds.has(id));

      if (restoredIds.length) {
        setSelectedClassificationIds(restoredIds);
      }

      setPendingOnly(stored.pendingOnly);
      setMineOnly(stored.mineOnly && isAuthenticated);
    }

    filtersRestoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!filtersRestoredRef.current) {
      return;
    }

    saveMapFilters({
      classificationIds: selectedClassificationIds,
      pendingOnly,
      mineOnly,
    });
  }, [mineOnly, pendingOnly, selectedClassificationIds]);

  useEffect(() => {
    syncMapUrl({ pointId: focusedPointId });
  }, [focusedPointId]);

  function handleMapViewChange(view: MapViewState) {
    syncMapUrl({ view });
  }

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

  async function refreshPoints(nextGroupFilter: string) {
    const nextPoints = await apiClient.getPointsWithFilters({
      groupId: nextGroupFilter,
    });
    setPoints(nextPoints);
    return nextPoints;
  }

  async function handleCreatePoint(payload: CreatePointPayload) {
    setErrorMessage(null);

    try {
      const createdPoint = await apiClient.createPoint(payload);
      const nextGroupFilter =
        groupFilter !== "all" && groupFilter !== createdPoint.group_id
          ? createdPoint.group_id
          : groupFilter;

      if (nextGroupFilter !== groupFilter) {
        applyGroupSelection(nextGroupFilter);
      }

      if (!selectedClassificationIds.includes(createdPoint.classification_id)) {
        setSelectedClassificationIds((current) => [...current, createdPoint.classification_id]);
      }

      const nextPoints = await refreshPoints(nextGroupFilter);
      const nextPoint = nextPoints.find((point) => point.id === createdPoint.id) ?? createdPoint;
      setFocusedPointId(nextPoint.id);
      setQuickViewPoint(nextPoint);
      setIsModalOpen(false);
      setFeedback({
        title:
          createdPoint.approval_status === "pending"
            ? "Ponto enviado para aprovação"
            : "Ponto criado com sucesso",
        message:
          createdPoint.approval_status === "pending"
            ? "O registro já pode ser acompanhado por você e pelos aprovadores do grupo."
            : "O novo ponto já aparece no mapa com os dados salvos.",
        actionHref: `/points/${nextPoint.id}`,
        actionLabel: "Abrir detalhe",
      });
      toast.success(
        createdPoint.approval_status === "pending"
          ? "Ponto enviado para aprovação."
          : "Ponto criado com sucesso.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível criar o ponto.";
      setErrorMessage(message);
      toast.error(message);
    }
  }

  async function handleReviewPoint(point: PointRecord, action: "approve" | "reject") {
    try {
      const updatedPoint = await apiClient.reviewPoint(point.id, action);
      const nextPoints = await refreshPoints(groupFilter);
      const nextPoint = nextPoints.find((item) => item.id === updatedPoint.id) ?? null;
      const shouldKeepVisible =
        nextPoint &&
        (!pendingOnly || isPointPendingForReview(nextPoint)) &&
        (!mineOnly || nextPoint.viewer_is_creator);

      setQuickViewPoint(shouldKeepVisible ? nextPoint : null);
      setFocusedPointId((current) =>
        shouldKeepVisible ? current : current === point.id ? null : current,
      );
      setFeedback({
        title:
          action === "approve"
            ? point.has_pending_update
              ? "Alteração aprovada"
              : "Ponto aprovado"
            : "Ponto rejeitado",
        message:
          action === "approve"
            ? "A listagem e o mapa já refletem a decisão tomada."
            : "O ponto continua disponível apenas para os perfis com acesso de revisão.",
        actionHref: `/points/${point.id}`,
        actionLabel: "Abrir detalhe",
      });

      toast.success(
        action === "approve"
          ? point.has_pending_update
            ? "Alteração aprovada."
            : "Ponto aprovado."
          : "Ponto rejeitado.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível revisar o ponto.");
    }
  }

  async function handleDeletePoint(point: PointRecord) {
    try {
      await apiClient.deletePoint(point.id);
      await refreshPoints(groupFilter);
      setQuickViewPoint(null);
      setFocusedPointId((current) => (current === point.id ? null : current));
      setFeedback({
        title: "Ponto arquivado",
        message: "O registro saiu das listagens operacionais, mas o histórico foi preservado.",
      });
      toast.success("Ponto arquivado com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível arquivar o ponto.");
    }
  }

  async function handleAddressSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!addressQuery.trim()) {
      toast.error("Informe um endereço para buscar.");
      return;
    }

    setIsSearchingAddress(true);

    try {
      const result = await mapRef.current?.searchAddress(addressQuery.trim());

      if (!result?.success) {
        toast.error(result?.message ?? "Não foi possível localizar o endereço.");
        return;
      }

      setIsFiltersOpen(false);
      toast.success(result.message ?? "Endereço localizado no mapa.");
    } finally {
      setIsSearchingAddress(false);
    }
  }

  async function handleCenterOnCurrentLocation() {
    setIsCenteringOnCurrentLocation(true);

    try {
      const result = await mapRef.current?.centerOnCurrentLocation();

      if (!result?.success) {
        toast.error(result?.message ?? "Não foi possível centralizar o mapa.");
        return;
      }

      toast.success(result.message ?? "Mapa centralizado na sua posição atual.");
    } finally {
      setIsCenteringOnCurrentLocation(false);
    }
  }

  function openEditDrawer(point: PointRecord) {
    setQuickViewPoint(null);
    setFocusedPointId(point.id);
    setEditingPointId(point.id);
  }

  async function handleEditSaved(updatedPoint: PointRecord) {
    const outcome = describePointUpdate(updatedPoint);

    try {
      await refreshPoints(groupFilter);
    } catch {
      // A lista sera atualizada na proxima carga; a edicao ja foi salva.
    }

    setEditingPointId(null);
    setFocusedPointId(updatedPoint.id);
    setFeedback({
      title: outcome.title,
      message: `${updatedPoint.title}: ${outcome.message}`,
      actionHref: `/points/${updatedPoint.id}`,
      actionLabel: "Abrir detalhe",
    });
    toast.success(outcome.toast);
  }

  function showListOnMobile() {
    listSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showMapOnMobile() {
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openPointModal(point: PointRecord) {
    setQuickViewPoint(point);
  }

  function centerPointOnMap(point: PointRecord) {
    // Pedido explicito do usuario: centraliza e aproxima no ponto.
    setFocusedPointId(point.id);
    mapRef.current?.focusPoint(point.id);
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
      setErrorMessage("Não ha classificações cadastradas para criar novos pontos.");
      return;
    }

    if (!submissionGroups.length) {
      setErrorMessage(
        isAuthenticated
          ? "Seu usuário não esta associado a um grupo com permissão para criar pontos."
          : "Faça login para criar pontos.",
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
      setErrorMessage("Não ha classificações cadastradas para criar novos pontos.");
      return;
    }

    if (!submissionGroups.length) {
      setErrorMessage(
        isAuthenticated
          ? "Seu usuário não esta associado a um grupo com permissão para criar pontos."
          : "Faça login para criar pontos com o botão direito no mapa.",
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
    const shouldFilterByTags =
      visibleTagOptions.length > 0 && selectedTagIds.length < visibleTagOptions.length;
    const shouldFilterBySpecies =
      visibleSpeciesOptions.length > 0 &&
      selectedSpeciesIds.length < visibleSpeciesOptions.length;

    return points.filter((point) => {
      if (!selectedClassificationIds.length) {
        return false;
      }

      if (pendingOnly && !isPointPendingForReview(point)) {
        return false;
      }

      if (mineOnly && !point.viewer_is_creator) {
        return false;
      }

      if (!selectedClassificationIds.includes(point.classification_id)) {
        return false;
      }

      if (
        point.classification_requires_species &&
        shouldFilterBySpecies &&
        (!point.species_id || !selectedSpeciesIds.includes(point.species_id))
      ) {
        return false;
      }

      if (!shouldFilterByTags) {
        return true;
      }

      if (!selectedTagIds.length) {
        return false;
      }

      const pointTagIds = (point.tags ?? [])
        .filter((tag) => tag.is_active)
        .map((tag) => tag.id);

      return selectedTagIds.some((tagId) => pointTagIds.includes(tagId));
    });
  }, [
    mineOnly,
    pendingOnly,
    points,
    selectedClassificationIds,
    selectedSpeciesIds,
    selectedTagIds,
    visibleSpeciesOptions,
    visibleTagOptions,
  ]);

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
  const groupHeading = currentGroupSummary?.name ?? "Todos os grupos visíveis";
  const groupSubheading = currentGroupSummary
    ? null
    : `${visibleGroups.length} grupos no filtro atual`;
  const desktopGroupSwitcherLabel =
    groupFilter === "all"
      ? "Todos os grupos visíveis"
      : isGroupSelectionImplicit
        ? "Escolher grupo"
        : "Trocar grupo";
  const mobileGroupSwitcherLabel =
    groupFilter === "all" ? "Grupos" : isGroupSelectionImplicit ? "Escolher" : "Trocar grupo";
  const hasClassificationRestriction =
    selectedClassificationIds.length !== activeClassificationIds.length ||
    activeClassificationIds.some(
      (classificationId) => !selectedClassificationIds.includes(classificationId),
    );
  const hasTagRestriction =
    visibleTagOptions.length > 0 && selectedTagIds.length < visibleTagOptions.length;
  const hasSpeciesRestriction =
    visibleSpeciesOptions.length > 0 && selectedSpeciesIds.length < visibleSpeciesOptions.length;
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];

    if (hasClassificationRestriction) {
      labels.push(
        selectedClassificationIds.length
          ? `${selectedClassificationIds.length} classificações`
          : "Nenhuma classificação",
      );
    }

    if (hasSpeciesRestriction) {
      labels.push(
        selectedSpeciesIds.length
          ? `${selectedSpeciesIds.length} espécies`
          : "Nenhuma espécie",
      );
    }

    if (hasTagRestriction) {
      labels.push(selectedTagIds.length ? `${selectedTagIds.length} tags` : "Nenhuma tag");
    }

    if (pendingOnly) {
      labels.push("Somente pendentes");
    }

    if (mineOnly) {
      labels.push("Meus pontos");
    }

    return labels;
  }, [
    hasClassificationRestriction,
    hasSpeciesRestriction,
    hasTagRestriction,
    mineOnly,
    pendingOnly,
    selectedClassificationIds.length,
    selectedSpeciesIds.length,
    selectedTagIds.length,
  ]);

  function toggleClassificationFilter(classificationId: string) {
    setSelectedClassificationIds((current) =>
      current.includes(classificationId)
        ? current.filter((currentId) => currentId !== classificationId)
        : [...current, classificationId],
    );
  }

  function toggleTagFilter(tagId: string) {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((currentId) => currentId !== tagId)
        : [...current, tagId],
    );
  }

  function selectAllClassifications() {
    setSelectedClassificationIds(activeClassificationIds);
  }

  function clearClassificationSelection() {
    setSelectedClassificationIds([]);
  }

  function toggleSpeciesFilter(speciesId: string) {
    setSelectedSpeciesIds((current) =>
      current.includes(speciesId)
        ? current.filter((currentId) => currentId !== speciesId)
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

  function clearMapFilters() {
    setSelectedClassificationIds(activeClassificationIds);
    setSelectedSpeciesIds(visibleSpeciesOptions.map((species) => species.id));
    setSelectedTagIds(visibleTagOptions.map((tag) => tag.id));
    setMineOnly(false);
    setPendingOnly(false);
  }

  const classificationQuickLabel = useMemo(() => {
    if (!selectedClassificationIds.length) {
      return "Nenhuma classificação";
    }

    if (selectedClassificationIds.length === activeClassificationIds.length) {
      return "Todas as classificações";
    }

    if (selectedClassificationIds.length === 1) {
      return (
        classifications.find((classification) => classification.id === selectedClassificationIds[0])
          ?.name ?? "1 classificação"
      );
    }

    return `${selectedClassificationIds.length} classificações`;
  }, [activeClassificationIds.length, classifications, selectedClassificationIds]);
  const hasAdvancedFiltersActive = hasSpeciesRestriction || hasTagRestriction;

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [page, safePage]);

  useEffect(() => {
    // A selecao do ponto e mantida mesmo se um filtro o esconder momentaneamente
    // (ela vem da URL e nao deve se perder enquanto os filtros sao restaurados).
    setQuickViewPoint((current) =>
      current && filteredPoints.some((point) => point.id === current.id) ? current : null,
    );
  }, [filteredPoints]);

  const sortedPointsRef = useRef(sortedPoints);
  sortedPointsRef.current = sortedPoints;

  // Ponto escolhido no mapa: abre a pagina da lista onde ele esta e rola ate ele (computador).
  useEffect(() => {
    if (!focusedPointId) {
      return;
    }

    const index = sortedPointsRef.current.findIndex(({ point }) => point.id === focusedPointId);

    if (index < 0) {
      return;
    }

    setPage(Math.floor(index / POINTS_PER_PAGE) + 1);

    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1180px)").matches) {
      window.requestAnimationFrame(() => {
        document
          .getElementById(`ponto-lista-${focusedPointId}`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  }, [focusedPointId]);

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
                  className="button-ghost compact group-switch-button"
                  onClick={() => setIsGroupPickerOpen(true)}
                  type="button"
                >
                  <Users aria-hidden="true" size={15} />
                  <span className="desktop-only">{desktopGroupSwitcherLabel}</span>
                  <span className="mobile-only">{mobileGroupSwitcherLabel}</span>
                </button>
                <button
                  className="button-ghost compact map-mobile-tools-toggle"
                  onClick={() => setIsFiltersOpen(true)}
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
                  onClick={() => setIsFiltersOpen(true)}
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

        {canCreatePoints ? (
          <div className="map-creation-hint" role="note">
            <span className="desktop-only">
              Use Novo ponto para criar no centro do mapa. Se preferir um atalho, clique com o botão direito para criar exatamente no local desejado.
            </span>
            <span className="mobile-only">
              No celular, arraste o mapa até o local desejado e toque em Novo ponto. O ponto será criado no centro do mapa.
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
            {isCenteringOnCurrentLocation ? "Localizando..." : "Minha posição"}
          </button>
        </div>

        <div className="map-quick-filters">
          <button
            className="button-ghost compact quick-filter-summary"
            onClick={() => setIsFiltersOpen(true)}
            type="button"
          >
            <Filter aria-hidden="true" size={15} />
            {classificationQuickLabel}
          </button>
          {canReviewInCurrentScope ? (
            <button
              className={`button-ghost compact quick-filter-chip${pendingOnly ? " active" : ""}`}
              onClick={() => setPendingOnly((current) => !current)}
              type="button"
            >
              Pendentes
            </button>
          ) : null}
          {isAuthenticated ? (
            <button
              className={`button-ghost compact quick-filter-chip${mineOnly ? " active" : ""}`}
              onClick={() => setMineOnly((current) => !current)}
              type="button"
            >
              Meus pontos
            </button>
          ) : null}
          {hasAdvancedFiltersActive ? <span className="badge">Filtros avançados ativos</span> : null}
        </div>
      </section>

      {feedback ? (
        <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} />
      ) : null}

      {activeFilterLabels.length ? (
        <section className="panel filter-summary-bar">
          <div className="stack-xs">
            <strong>Filtros ativos no mapa</strong>
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
              onClick={() => setIsFiltersOpen(true)}
              type="button"
            >
              Ver filtros
            </button>
            <button className="button-ghost compact danger" onClick={clearMapFilters} type="button">
              Limpar filtros
            </button>
          </div>
        </section>
      ) : null}

      {errorMessage ? <p className="error">{errorMessage}</p> : null}

      <div className="map-workspace">
      <section className="panel map-panel" ref={mapSectionRef}>
        <MapCanvas
          ref={mapRef}
          autoCenterOnCurrentLocation={!startView}
          fitRequestKey={fitRequestKey}
          highlightedPointId={hoveredPointId}
          initialCenter={
            startView ? { latitude: startView.latitude, longitude: startView.longitude } : null
          }
          initialZoom={startView?.zoom ?? 17}
          onCenterChange={handleMapCenterChange}
          onEditPoint={isAuthenticated ? openEditDrawer : undefined}
          onMapContextMenu={handleMapContextMenu}
          onOpenPointSummary={(point) => setQuickViewPoint(point)}
          onSelectPoint={(point) => setFocusedPointId(point.id)}
          onViewChange={handleMapViewChange}
          points={filteredPoints}
          selectedPointId={focusedPointId}
        />
        <div className="map-overlay-actions">
          <button
            className="map-overlay-button"
            disabled={!filteredPoints.length}
            onClick={() => setFitRequestKey((current) => current + 1)}
            title="Enquadrar todos os pontos do filtro atual"
            type="button"
          >
            <Maximize2 aria-hidden="true" size={15} />
            <span>Ver todos</span>
          </button>
        </div>
        <button
          className="map-overlay-button map-list-toggle mobile-only-flex"
          onClick={showListOnMobile}
          type="button"
        >
          <ListIcon aria-hidden="true" size={15} />
          <span>Lista ({sortedPoints.length})</span>
        </button>
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

      <section className="list-card stack-md map-list-panel" ref={listSectionRef}>
        <div className="panel-header map-list-header">
          <div className="stack-xs">
            <h2 className="section-title">Pontos do filtro</h2>
            <p className="subtitle">Do mais perto ao mais longe do centro do mapa.</p>
          </div>
          <div className="button-row map-list-header-badges">
            <span className="badge">{sortedPoints.length} pontos</span>
            {totalPages > 1 ? (
              <span className="badge">
                Página {safePage} de {totalPages}
              </span>
            ) : null}
            <button
              className="button-ghost compact mobile-only-flex map-back-to-map"
              onClick={showMapOnMobile}
              type="button"
            >
              <MapIcon aria-hidden="true" size={15} />
              Ver mapa
            </button>
          </div>
        </div>

        <div className="point-line-list">
          {paginatedPoints.length ? (
            paginatedPoints.map(({ point, distance }) => (
              <article
                className={`point-line-item point-line-card${focusedPointId === point.id ? " is-selected" : ""}`}
                id={`ponto-lista-${point.id}`}
                key={point.id}
                onMouseEnter={() => setHoveredPointId(point.id)}
                onMouseLeave={() =>
                  setHoveredPointId((current) => (current === point.id ? null : current))
                }
              >
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
                  <PointTagBadges
                    className="point-tag-list point-tag-list-compact"
                    limit={3}
                    tags={point.tags}
                  />
                </div>
                <div className="point-line-metric">
                  <span className="muted">Distância</span>
                  <strong className="point-line-distance">{formatDistance(distance)}</strong>
                </div>
                <div className="point-line-actions">
                  <button
                    className="button-ghost compact"
                    onClick={() => {
                      centerPointOnMap(point);
                      showMapOnMobile();
                    }}
                    type="button"
                  >
                    <LocateFixed aria-hidden="true" size={15} />
                    No mapa
                  </button>
                  <button
                    className="button-ghost compact"
                    onClick={() => openPointModal(point)}
                    type="button"
                  >
                    <Eye aria-hidden="true" size={15} />
                    Resumo
                  </button>
                  {isAuthenticated && (point.viewer_can_manage || point.viewer_can_request_update) ? (
                    <button
                      className="button-ghost compact"
                      onClick={() => openEditDrawer(point)}
                      type="button"
                    >
                      <Pencil aria-hidden="true" size={15} />
                      {point.viewer_can_manage ? "Editar" : "Sugerir"}
                    </button>
                  ) : null}
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
              Próxima
            </button>
          </div>
        ) : null}
      </section>
      </div>

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
        onEdit={isAuthenticated ? openEditDrawer : undefined}
        onDelete={handleDeletePoint}
        onReject={(point) => handleReviewPoint(point, "reject")}
        point={quickViewPoint}
      />

      <PointEditDrawer
        classifications={classifications}
        onClose={() => setEditingPointId(null)}
        onSaved={handleEditSaved}
        pointId={editingPointId}
        speciesAdminHref={speciesAdminHref}
        speciesCatalog={speciesCatalog}
        submissionGroups={submissionGroups}
        visibleGroups={visibleGroups}
      />

      {isGroupPickerOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card modal-card-compact stack-md" ref={groupPickerModalRef} tabIndex={-1}>
            <div className="modal-header">
              <div className="modal-header-top">
                <div className="stack-xs">
                  <h2 className="section-title">Escolher grupo</h2>
                  <p className="subtitle">Troque o escopo visível do mapa.</p>
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
                  <strong>Todos os grupos visíveis</strong>
                  <span className="muted">Exibe os grupos públicos ou acessíveis no seu perfil.</span>
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
                      {group.is_public ? "Grupo público" : "Grupo privado"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isFiltersOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card modal-card-compact stack-md" ref={filtersModalRef} tabIndex={-1}>
            <div className="modal-header">
              <div className="modal-header-top">
                <div className="stack-xs">
                  <h2 className="section-title">Filtros avançados e busca</h2>
                  <p className="subtitle">
                    Ajuste classificações, refine por espécies e tags e localize um endereço no mapa.
                  </p>
                </div>
                <button
                  aria-label="Fechar janela"
                  className="modal-close-button"
                  onClick={() => setIsFiltersOpen(false)}
                  type="button"
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
            </div>

            <div className="stack-md">
              <div className="stack-sm">
                <div className="panel-header">
                  <div className="stack-xs">
                    <strong>Classificações</strong>
                    <span className="muted">
                      Os pontos do mapa respeitam todas as classificações marcadas abaixo.
                    </span>
                  </div>
                  <div className="button-row">
                    <button className="button-ghost" onClick={selectAllClassifications} type="button">
                      Marcar todas
                    </button>
                    <button className="button-ghost" onClick={clearClassificationSelection} type="button">
                      Desmarcar todas
                    </button>
                  </div>
                </div>

                <div className="map-filter-grid">
                  {classifications.map((classification) => (
                    <label className="inline-toggle map-filter-option" key={classification.id}>
                      <input
                        checked={selectedClassificationIds.includes(classification.id)}
                        onChange={() => toggleClassificationFilter(classification.id)}
                        type="checkbox"
                      />
                      <span>{classification.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="stack-sm">
                <div className="panel-header">
                  <div className="stack-xs">
                    <strong>Espécies</strong>
                    <span className="muted">
                      O filtro por espécie afeta apenas os pontos das classificações que usam espécies.
                    </span>
                  </div>
                  {visibleSpeciesOptions.length ? (
                    <div className="button-row">
                      <button className="button-ghost" onClick={selectAllSpecies} type="button">
                        Marcar todas
                      </button>
                      <button className="button-ghost" onClick={clearSpeciesSelection} type="button">
                        Desmarcar todas
                      </button>
                    </div>
                  ) : null}
                </div>

                {selectedClassificationIds.length ? (
                  visibleSpeciesOptions.length ? (
                    <div className="map-filter-grid">
                      {visibleSpeciesOptions.map((species) => (
                        <label className="inline-toggle map-filter-option" key={species.id}>
                          <input
                            checked={selectedSpeciesIds.includes(species.id)}
                            onChange={() => toggleSpeciesFilter(species.id)}
                            type="checkbox"
                          />
                          <span>{species.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">
                      Nenhuma espécie encontrada nas classificações selecionadas.
                    </span>
                  )
                ) : (
                  <span className="muted">
                    Marque pelo menos uma classificação para exibir as espécies relacionadas.
                  </span>
                )}
              </div>

              <div className="stack-sm">
                <div className="panel-header">
                  <div className="stack-xs">
                    <strong>Tags</strong>
                    <span className="muted">
                      As tags acompanham as classificações marcadas. Se todas estiverem marcadas, o mapa não restringe por tags.
                    </span>
                  </div>
                  {visibleTagOptions.length ? (
                    <div className="button-row">
                      <button className="button-ghost" onClick={selectAllTags} type="button">
                        Marcar todas
                      </button>
                      <button className="button-ghost" onClick={clearTagSelection} type="button">
                        Desmarcar todas
                      </button>
                    </div>
                  ) : null}
                </div>
                {selectedClassificationIds.length ? (
                  visibleTagOptions.length ? (
                    <div className="map-filter-grid">
                      {visibleTagOptions.map((tag) => (
                        <label className="inline-toggle map-filter-option" key={tag.id}>
                          <input
                            checked={selectedTagIds.includes(tag.id)}
                            onChange={() => toggleTagFilter(tag.id)}
                            type="checkbox"
                          />
                          <span>{tag.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">
                      Nenhuma tag cadastrada para as classificações selecionadas.
                    </span>
                  )
                ) : (
                  <span className="muted">
                    Marque pelo menos uma classificação para exibir as tags relacionadas.
                  </span>
                )}
              </div>

              <form className="map-search-form" onSubmit={handleAddressSearch}>
                <label className="toolbar-label" htmlFor="map-address-search-mobile">
                  <Search aria-hidden="true" size={15} />
                  <span>Buscar endereço</span>
                </label>
                <div className="map-search-row">
                  <input
                    id="map-address-search-mobile"
                    onChange={(event) => setAddressQuery(event.target.value)}
                    placeholder="Rua, bairro, número ou referência"
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
              {isAuthenticated ? (
                <label className="inline-toggle">
                  <input
                    checked={mineOnly}
                    onChange={(event) => setMineOnly(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Exibir somente os meus pontos</span>
                </label>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
