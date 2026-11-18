"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";

import { apiClient } from "@/lib/api-client";
import { getCurrentDeviceLocation } from "@/lib/device-location";
import { loadGoogleMapsLibraries } from "@/lib/google-maps";
import { getPointDisplayColor, getPointDisplayStatusLabel } from "@/lib/point-display";
import type { MapViewState } from "@/lib/map-view-params";
import type { PointMediaRecord, PointRecord } from "@/types/domain";

interface MapCanvasProps {
  points: PointRecord[];
  selectedPointId?: string | null;
  /** Ponto destacado sem abrir o balao (ex.: mouse sobre o item da lista). */
  highlightedPointId?: string | null;
  onMapContextMenu?: (coordinates: { longitude: number; latitude: number }) => void;
  onSelectPoint?: (point: PointRecord) => void;
  onOpenPointSummary?: (point: PointRecord) => void;
  /** Quando informado, o balao do ponto mostra o botao "Editar" para quem tem permissao. */
  onEditPoint?: (point: PointRecord) => void;
  onCenterChange?: (center: { latitude: number; longitude: number }) => void;
  /** Disparado quando o mapa para de se mover, com centro e zoom. */
  onViewChange?: (view: MapViewState) => void;
  initialCenter?: { latitude: number; longitude: number } | null;
  initialZoom?: number;
  autoCenterOnCurrentLocation?: boolean;
  /** Cada mudanca deste numero reenquadra o mapa nos pontos atuais. */
  fitRequestKey?: number;
}

export interface MapCanvasHandle {
  focusPoint: (pointId: string) => boolean;
  fitToPoints: () => void;
  searchAddress: (query: string) => Promise<{ success: boolean; message?: string }>;
  centerOnCurrentLocation: () => Promise<{ success: boolean; message?: string }>;
}

interface MarkerEntry {
  point: PointRecord;
  marker: google.maps.Marker;
  iconKey: string;
}

const defaultCenter = { lng: -43.2096, lat: -22.9035 };
const FOCUS_ZOOM = 17;
const FIT_MAX_ZOOM = 16;
const CLUSTER_MAX_ZOOM = 15;

function canEditPoint(point: PointRecord) {
  return point.viewer_can_manage || point.viewer_can_request_update;
}

function styleInfoButton(button: HTMLButtonElement, primary: boolean) {
  button.type = "button";
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.minHeight = "34px";
  button.style.padding = "0.45rem 0.85rem";
  button.style.borderRadius = "999px";
  button.style.border = primary ? "1px solid #24553a" : "1px solid rgba(21, 34, 27, 0.14)";
  button.style.background = primary ? "#24553a" : "#ffffff";
  button.style.color = primary ? "#ffffff" : "#15221b";
  button.style.fontWeight = "600";
  button.style.cursor = "pointer";
}

function createPopupContent(
  point: PointRecord,
  previewMedia: PointMediaRecord | null,
  actions: { onOpenSummary?: (() => void) | null; onEdit?: (() => void) | null },
) {
  const wrapper = document.createElement("div");
  wrapper.style.maxWidth = "250px";
  const title = document.createElement("strong");
  const meta = document.createElement("p");

  title.textContent = point.title;
  meta.textContent = `${point.classification_name} · ${getPointDisplayStatusLabel(point)}`;
  meta.style.margin = "0.35rem 0 0";

  wrapper.appendChild(title);
  wrapper.appendChild(meta);

  if (previewMedia?.signed_url) {
    const image = document.createElement("img");
    image.src = previewMedia.signed_url;
    image.alt = previewMedia.caption || `Foto de ${point.title}`;
    image.style.width = "100%";
    image.style.aspectRatio = "4 / 3";
    image.style.objectFit = "cover";
    image.style.borderRadius = "10px";
    image.style.marginTop = "0.55rem";
    wrapper.appendChild(image);
  }

  if (point.classification_requires_species && point.species_name) {
    const species = document.createElement("p");
    species.textContent = `Espécie: ${point.species_name}`;
    species.style.margin = "0.35rem 0 0";
    species.style.color = "#506056";
    wrapper.appendChild(species);
  }

  if (point.tags?.length) {
    const tags = document.createElement("p");
    tags.textContent = `Tags: ${point.tags
      .slice(0, 3)
      .map((tag) => tag.name)
      .join(", ")}`;
    tags.style.margin = "0.35rem 0 0";
    tags.style.color = "#506056";
    wrapper.appendChild(tags);
  }

  if (actions.onOpenSummary || actions.onEdit) {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.gap = "0.45rem";
    row.style.marginTop = "0.7rem";

    if (actions.onEdit) {
      const editButton = document.createElement("button");
      editButton.textContent = point.viewer_can_manage ? "Editar" : "Sugerir alteração";
      styleInfoButton(editButton, true);
      editButton.addEventListener("click", actions.onEdit);
      row.appendChild(editButton);
    }

    if (actions.onOpenSummary) {
      const summaryButton = document.createElement("button");
      summaryButton.textContent = "Ver resumo";
      styleInfoButton(summaryButton, !actions.onEdit);
      summaryButton.addEventListener("click", actions.onOpenSummary);
      row.appendChild(summaryButton);
    }

    wrapper.appendChild(row);
  }

  return wrapper;
}

function buildMarkerIcon(
  point: PointRecord,
  state: { selected: boolean; highlighted: boolean },
): google.maps.Symbol {
  const emphasized = state.selected || state.highlighted;

  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: getPointDisplayColor(point),
    fillOpacity: 1,
    strokeColor: state.highlighted && !state.selected ? "#15221b" : "#ffffff",
    strokeOpacity: 1,
    strokeWeight: emphasized ? 2.5 : 2,
    scale: state.selected ? 9 : state.highlighted ? 8 : 6,
  };
}

function iconKeyFor(point: PointRecord, selected: boolean, highlighted: boolean) {
  return `${getPointDisplayColor(point)}|${selected ? 1 : 0}|${highlighted ? 1 : 0}`;
}

function createClusterRenderer() {
  return {
    render({ count, position }: { count: number; position: google.maps.LatLng }) {
      const size = Math.min(26, 15 + Math.log2(count) * 2.4);

      return new google.maps.Marker({
        position,
        zIndex: 500 + count,
        title: `${count} pontos nesta área — toque para aproximar`,
        label: {
          text: String(count),
          color: "#ffffff",
          fontSize: "12px",
          fontWeight: "700",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: "#24553a",
          fillOpacity: 0.92,
          strokeColor: "#ffffff",
          strokeOpacity: 1,
          strokeWeight: 2.5,
          scale: size,
        },
      });
    },
  };
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  {
    points,
    selectedPointId,
    highlightedPointId,
    onMapContextMenu,
    onSelectPoint,
    onOpenPointSummary,
    onEditPoint,
    onCenterChange,
    onViewChange,
    initialCenter,
    initialZoom = 18,
    autoCenterOnCurrentLocation = true,
    fitRequestKey = 0,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const pointsRef = useRef(points);
  const currentLocationMarkerRef = useRef<google.maps.Marker | null>(null);
  const searchLocationMarkerRef = useRef<google.maps.Marker | null>(null);
  const pointMediaCacheRef = useRef<Map<string, PointMediaRecord[]>>(new Map());
  const onSelectPointRef = useRef(onSelectPoint);
  const onOpenPointSummaryRef = useRef(onOpenPointSummary);
  const onEditPointRef = useRef(onEditPoint);
  const onCenterChangeRef = useRef(onCenterChange);
  const onViewChangeRef = useRef(onViewChange);
  const activePopupPointIdRef = useRef<string | null>(null);
  const contextMenuListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  /** Verdadeiro quando a vista ja foi definida (URL, localizacao ou enquadramento inicial). */
  const viewDecidedRef = useRef(false);
  const initialCenterRef = useRef(initialCenter);
  const initialZoomRef = useRef(initialZoom);
  const autoCenterOnCurrentLocationRef = useRef(autoCenterOnCurrentLocation);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  pointsRef.current = points;

  useEffect(() => {
    onSelectPointRef.current = onSelectPoint;
    onOpenPointSummaryRef.current = onOpenPointSummary;
    onEditPointRef.current = onEditPoint;
    onCenterChangeRef.current = onCenterChange;
    onViewChangeRef.current = onViewChange;
  }, [onSelectPoint, onOpenPointSummary, onEditPoint, onCenterChange, onViewChange]);

  useImperativeHandle(ref, () => ({
    focusPoint(pointId: string) {
      return focusPointOnMap(pointId);
    },
    fitToPoints() {
      if (mapRef.current) {
        fitMapToPoints(mapRef.current, pointsRef.current);
      }
    },
    async searchAddress(query: string) {
      const trimmedQuery = query.trim();

      if (!trimmedQuery) {
        return { success: false, message: "Informe um endereço para buscar." };
      }

      const map = mapRef.current;
      const geocoder = geocoderRef.current;
      const infoWindow = infoWindowRef.current;

      if (!map || !geocoder || !infoWindow) {
        return { success: false, message: "O mapa ainda não terminou de carregar." };
      }

      try {
        const response = await geocoder.geocode({
          address: trimmedQuery,
          region: "BR",
        });

        const result = response.results?.[0];

        if (!result?.geometry?.location) {
          return { success: false, message: "Endereço não encontrado." };
        }

        const location = result.geometry.location;
        const latLng = { lat: location.lat(), lng: location.lng() };

        viewDecidedRef.current = true;
        map.panTo(latLng);
        map.setZoom(18);

        searchLocationMarkerRef.current?.setMap(null);
        searchLocationMarkerRef.current = new google.maps.Marker({
          map,
          position: latLng,
          title: result.formatted_address,
          zIndex: 1100,
          icon: {
            path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            fillColor: "#24553a",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeOpacity: 1,
            strokeWeight: 2,
            scale: 6,
          },
        });

        const content = document.createElement("div");
        const title = document.createElement("strong");
        const address = document.createElement("p");
        title.textContent = "Endereço localizado";
        address.textContent = result.formatted_address;
        address.style.margin = "0.35rem 0 0";
        content.appendChild(title);
        content.appendChild(address);

        activePopupPointIdRef.current = null;
        infoWindow.setContent(content);
        infoWindow.open({
          anchor: searchLocationMarkerRef.current,
          map,
        });

        return { success: true, message: result.formatted_address };
      } catch {
        return {
          success: false,
          message: "Não foi possível buscar o endereço. Verifique a Geocoding API.",
        };
      }
    },
    async centerOnCurrentLocation() {
      const map = mapRef.current;

      if (!map) {
        return { success: false, message: "O mapa ainda não terminou de carregar." };
      }

      return centerMapOnCurrentLocation(map);
    },
  }));

  useEffect(() => {
    let ignore = false;
    const pointMediaCache = pointMediaCacheRef.current;
    const markers = markersRef.current;

    async function initializeMap() {
      try {
        const { Map, InfoWindow, Geocoder } = await loadGoogleMapsLibraries();

        if (ignore || !containerRef.current || mapRef.current) {
          return;
        }

        geocoderRef.current = new Geocoder();
        mapRef.current = new Map(containerRef.current, {
          center: defaultCenter,
          zoom: 12,
          clickableIcons: false,
          fullscreenControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          // O mapa ocupa a area util da tela: um dedo move o mapa, sem exigir dois dedos.
          gestureHandling: "greedy",
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || undefined,
        });
        infoWindowRef.current = new InfoWindow();
        clustererRef.current = new MarkerClusterer({
          map: mapRef.current,
          markers: [],
          algorithm: new SuperClusterAlgorithm({ maxZoom: CLUSTER_MAX_ZOOM, radius: 64 }),
          renderer: createClusterRenderer(),
        });

        if (initialCenterRef.current) {
          viewDecidedRef.current = true;
          mapRef.current.setCenter({
            lat: initialCenterRef.current.latitude,
            lng: initialCenterRef.current.longitude,
          });
          mapRef.current.setZoom(initialZoomRef.current);
        } else if (autoCenterOnCurrentLocationRef.current) {
          await centerMapOnCurrentLocation(mapRef.current);
        }

        if (!ignore) {
          setIsReady(true);
        }
      } catch (error) {
        if (!ignore) {
          setLoadError(
            error instanceof Error ? error.message : "Não foi possível carregar o Google Maps.",
          );
        }
      }
    }

    void initializeMap();

    return () => {
      ignore = true;
      contextMenuListenerRef.current?.remove();
      contextMenuListenerRef.current = null;
      idleListenerRef.current?.remove();
      idleListenerRef.current = null;
      clustererRef.current?.clearMarkers();
      clustererRef.current?.setMap(null);
      clustererRef.current = null;
      markers.forEach(({ marker }) => {
        if (typeof google !== "undefined") {
          google.maps.event.clearInstanceListeners(marker);
        }
        marker.setMap(null);
      });
      markers.clear();
      currentLocationMarkerRef.current?.setMap(null);
      currentLocationMarkerRef.current = null;
      searchLocationMarkerRef.current?.setMap(null);
      searchLocationMarkerRef.current = null;
      pointMediaCache.clear();
      activePopupPointIdRef.current = null;
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      geocoderRef.current = null;
      mapRef.current = null;
      viewDecidedRef.current = false;
      setIsReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    contextMenuListenerRef.current?.remove();
    contextMenuListenerRef.current = null;

    if (!map || !onMapContextMenu || !isReady) {
      return;
    }

    contextMenuListenerRef.current = map.addListener(
      "contextmenu",
      (event: google.maps.MapMouseEvent) => {
        if (!event.latLng) {
          return;
        }

        onMapContextMenu({
          longitude: Number(event.latLng.lng().toFixed(6)),
          latitude: Number(event.latLng.lat().toFixed(6)),
        });
      },
    );

    return () => {
      contextMenuListenerRef.current?.remove();
      contextMenuListenerRef.current = null;
    };
  }, [isReady, onMapContextMenu]);

  useEffect(() => {
    const map = mapRef.current;

    idleListenerRef.current?.remove();
    idleListenerRef.current = null;

    if (!map || !isReady) {
      return;
    }

    const emitView = () => {
      const center = map.getCenter();

      if (!center) {
        return;
      }

      const latitude = Number(center.lat().toFixed(6));
      const longitude = Number(center.lng().toFixed(6));

      onCenterChangeRef.current?.({ latitude, longitude });
      onViewChangeRef.current?.({ latitude, longitude, zoom: map.getZoom() ?? 12 });
    };

    idleListenerRef.current = map.addListener("idle", emitView);
    emitView();

    return () => {
      idleListenerRef.current?.remove();
      idleListenerRef.current = null;
    };
  }, [isReady]);

  // Sincroniza os marcadores com a lista de pontos sem recriar os que nao mudaram.
  useEffect(() => {
    const map = mapRef.current;
    const clusterer = clustererRef.current;

    if (!map || !clusterer || !isReady) {
      return;
    }

    const markers = markersRef.current;
    const nextIds = new Set(points.map((point) => point.id));
    const removed: google.maps.Marker[] = [];
    const added: google.maps.Marker[] = [];

    markers.forEach((entry, pointId) => {
      if (!nextIds.has(pointId)) {
        google.maps.event.clearInstanceListeners(entry.marker);
        removed.push(entry.marker);
        markers.delete(pointId);
      }
    });

    for (const point of points) {
      const selected = selectedPointId === point.id;
      const highlighted = highlightedPointId === point.id;
      const iconKey = iconKeyFor(point, selected, highlighted);
      const existing = markers.get(point.id);

      if (existing) {
        existing.point = point;
        const position = existing.marker.getPosition();

        if (
          !position ||
          position.lat() !== point.latitude ||
          position.lng() !== point.longitude
        ) {
          existing.marker.setPosition({ lat: point.latitude, lng: point.longitude });
        }

        existing.marker.setTitle(point.title);

        if (existing.iconKey !== iconKey) {
          existing.marker.setIcon(buildMarkerIcon(point, { selected, highlighted }));
          existing.iconKey = iconKey;
        }

        continue;
      }

      const marker = new google.maps.Marker({
        position: { lat: point.latitude, lng: point.longitude },
        title: point.title,
        icon: buildMarkerIcon(point, { selected, highlighted }),
        zIndex: selected ? 1000 : 100,
      });
      const entry: MarkerEntry = { point, marker, iconKey };

      marker.addListener("click", () => {
        void openPointInfoWindow(entry.point);
        onSelectPointRef.current?.(entry.point);
      });

      markers.set(point.id, entry);
      added.push(marker);
    }

    if (removed.length) {
      clusterer.removeMarkers(removed, true);
      removed.forEach((marker) => marker.setMap(null));
    }

    if (added.length) {
      clusterer.addMarkers(added, true);
    }

    if (removed.length || added.length) {
      clusterer.render();
    }

    if (activePopupPointIdRef.current && !nextIds.has(activePopupPointIdRef.current)) {
      activePopupPointIdRef.current = null;
      infoWindowRef.current?.close();
    }

    // O enquadramento automatico acontece uma unica vez, quando ainda nao ha vista definida.
    if (!viewDecidedRef.current && points.length) {
      viewDecidedRef.current = true;
      fitMapToPoints(map, points);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, points]);

  // Destaque visual (selecao e mouse sobre a lista): troca so o icone dos marcadores afetados.
  useEffect(() => {
    if (!isReady) {
      return;
    }

    markersRef.current.forEach((entry, pointId) => {
      const selected = selectedPointId === pointId;
      const highlighted = highlightedPointId === pointId;
      const iconKey = iconKeyFor(entry.point, selected, highlighted);

      if (entry.iconKey !== iconKey) {
        entry.marker.setIcon(buildMarkerIcon(entry.point, { selected, highlighted }));
        entry.marker.setZIndex(selected ? 1000 : highlighted ? 900 : 100);
        entry.iconKey = iconKey;
      }
    });
  }, [highlightedPointId, isReady, selectedPointId]);

  // Abre o balao do ponto selecionado; so move o mapa se o ponto estiver fora da tela.
  useEffect(() => {
    const map = mapRef.current;
    const infoWindow = infoWindowRef.current;

    if (!map || !infoWindow || !isReady) {
      return;
    }

    if (!selectedPointId) {
      if (activePopupPointIdRef.current) {
        activePopupPointIdRef.current = null;
        infoWindow.close();
      }
      return;
    }

    const entry = markersRef.current.get(selectedPointId);

    if (!entry) {
      return;
    }

    if (activePopupPointIdRef.current !== selectedPointId) {
      void openPointInfoWindow(entry.point);
    }

    const position = entry.marker.getPosition();
    const bounds = map.getBounds();

    if (position && bounds && !bounds.contains(position)) {
      map.panTo(position);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, selectedPointId]);

  useEffect(() => {
    if (!fitRequestKey || !isReady || !mapRef.current) {
      return;
    }

    viewDecidedRef.current = true;
    fitMapToPoints(mapRef.current, pointsRef.current);
  }, [fitRequestKey, isReady]);

  return (
    <div className="map-stage">
      <div className="map-canvas" ref={containerRef} />
      {!isReady || loadError ? (
        <div className="map-state" role="status">
          {loadError ? null : <span aria-hidden="true" className="map-spinner" />}
          <p className="muted">{loadError ?? "Carregando o mapa…"}</p>
        </div>
      ) : null}
    </div>
  );

  function fitMapToPoints(map: google.maps.Map, targetPoints: PointRecord[]) {
    if (!targetPoints.length) {
      return;
    }

    if (targetPoints.length === 1) {
      map.setCenter({ lat: targetPoints[0].latitude, lng: targetPoints[0].longitude });
      map.setZoom(FIT_MAX_ZOOM);
      return;
    }

    const bounds = new google.maps.LatLngBounds();

    targetPoints.forEach((point) => {
      bounds.extend({ lat: point.latitude, lng: point.longitude });
    });

    google.maps.event.addListenerOnce(map, "bounds_changed", () => {
      if ((map.getZoom() ?? 0) > FIT_MAX_ZOOM) {
        map.setZoom(FIT_MAX_ZOOM);
      }
    });

    map.fitBounds(bounds, 70);
  }

  function focusPointOnMap(pointId: string, notifySelection = false) {
    const map = mapRef.current;
    const entry = markersRef.current.get(pointId);

    if (!map || !entry) {
      return false;
    }

    const position = entry.marker.getPosition();

    if (position) {
      viewDecidedRef.current = true;
      map.panTo(position);
      if ((map.getZoom() ?? 0) < FOCUS_ZOOM) {
        map.setZoom(FOCUS_ZOOM);
      }
    }

    void openPointInfoWindow(entry.point);

    if (notifySelection) {
      onSelectPointRef.current?.(entry.point);
    }

    return true;
  }

  async function centerMapOnCurrentLocation(map: google.maps.Map) {
    const result = await getCurrentDeviceLocation();

    if (!result.success || !result.coordinates) {
      return { success: false, message: result.message };
    }

    const userLocation = {
      lat: result.coordinates.latitude,
      lng: result.coordinates.longitude,
    };

    viewDecidedRef.current = true;
    map.setCenter(userLocation);
    map.setZoom(Math.max(map.getZoom() ?? 12, FOCUS_ZOOM));

    currentLocationMarkerRef.current?.setMap(null);
    currentLocationMarkerRef.current = new google.maps.Marker({
      map,
      position: userLocation,
      title: "Sua localização",
      zIndex: 1200,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: "#2d6e9f",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeOpacity: 1,
        strokeWeight: 2,
        scale: 7,
      },
    });

    return { success: true, message: "Mapa centralizado na sua posição atual." };
  }

  function showInfoWindow(point: PointRecord, media: PointMediaRecord | null) {
    const map = mapRef.current;
    const infoWindow = infoWindowRef.current;
    const entry = markersRef.current.get(point.id);

    if (!map || !infoWindow) {
      return;
    }

    infoWindow.setContent(
      createPopupContent(point, media, {
        onOpenSummary: onOpenPointSummaryRef.current
          ? () => onOpenPointSummaryRef.current?.(point)
          : null,
        onEdit:
          onEditPointRef.current && canEditPoint(point)
            ? () => onEditPointRef.current?.(point)
            : null,
      }),
    );

    // Marcador agrupado (sem mapa proprio) nao serve de ancora: usa a posicao do ponto.
    if (entry?.marker.getMap()) {
      infoWindow.open({ anchor: entry.marker, map });
    } else {
      infoWindow.setPosition({ lat: point.latitude, lng: point.longitude });
      infoWindow.open({ map });
    }
  }

  async function openPointInfoWindow(point: PointRecord) {
    activePopupPointIdRef.current = point.id;

    const cachedMedia = pointMediaCacheRef.current.get(point.id);
    showInfoWindow(point, cachedMedia?.[0] ?? null);

    if (cachedMedia) {
      return;
    }

    try {
      const media = await apiClient.getPointMedia(point.id);
      pointMediaCacheRef.current.set(point.id, media);

      if (activePopupPointIdRef.current === point.id && media[0]) {
        showInfoWindow(markersRef.current.get(point.id)?.point ?? point, media[0]);
      }
    } catch {
      pointMediaCacheRef.current.set(point.id, []);
    }
  }
});
