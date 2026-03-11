"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { apiClient } from "@/lib/api-client";
import { loadGoogleMapsLibraries } from "@/lib/google-maps";
import { getPointDisplayColor, getPointDisplayStatusLabel } from "@/lib/point-display";
import type { PointMediaRecord, PointRecord } from "@/types/domain";

interface MapCanvasProps {
  points: PointRecord[];
  selectedPointId?: string | null;
  onMapContextMenu?: (coordinates: { longitude: number; latitude: number }) => void;
  onSelectPoint?: (point: PointRecord) => void;
  onCenterChange?: (center: { latitude: number; longitude: number }) => void;
}

export interface MapCanvasHandle {
  focusPoint: (pointId: string) => boolean;
  searchAddress: (query: string) => Promise<{ success: boolean; message?: string }>;
  centerOnCurrentLocation: () => Promise<{ success: boolean; message?: string }>;
}

const defaultCenter = { lng: -43.2096, lat: -22.9035 };

function createPopupContent(point: PointRecord, previewMedia?: PointMediaRecord | null) {
  const wrapper = document.createElement("div");
  wrapper.style.maxWidth = "240px";
  const title = document.createElement("strong");
  const meta = document.createElement("p");

  title.textContent = point.title;
  meta.textContent = `${point.classification_name} - ${getPointDisplayStatusLabel(point)}`;
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

    const downloadLink = document.createElement("a");
    downloadLink.href = previewMedia.signed_url;
    downloadLink.target = "_blank";
    downloadLink.rel = "noreferrer";
    downloadLink.textContent = "Baixar imagem";
    downloadLink.style.display = "inline-block";
    downloadLink.style.marginTop = "0.5rem";
    downloadLink.style.color = "#24553a";
    downloadLink.style.fontWeight = "600";
    wrapper.appendChild(downloadLink);
  }

  if (point.classification_requires_species && point.species_name) {
    const species = document.createElement("p");
    species.textContent = `Especie: ${point.species_name}`;
    species.style.margin = "0.35rem 0 0";
    species.style.color = "#506056";
    wrapper.appendChild(species);
  }

  return wrapper;
}

function buildMarkerIcon(point: PointRecord, isSelected: boolean): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: getPointDisplayColor(point),
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeOpacity: 1,
    strokeWeight: isSelected ? 2.5 : 2,
    scale: isSelected ? 8 : 6,
  };
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  {
    points,
    selectedPointId,
    onMapContextMenu,
    onSelectPoint,
    onCenterChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const markersRef = useRef<
    Array<{ pointId: string; point: PointRecord; marker: google.maps.Marker }>
  >([]);
  const currentLocationMarkerRef = useRef<google.maps.Marker | null>(null);
  const searchLocationMarkerRef = useRef<google.maps.Marker | null>(null);
  const pointMediaCacheRef = useRef<Map<string, PointMediaRecord[]>>(new Map());
  const onSelectPointRef = useRef(onSelectPoint);
  const onCenterChangeRef = useRef(onCenterChange);
  const activePopupPointIdRef = useRef<string | null>(null);
  const contextMenuListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const boundsListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const skipNextBoundsFitRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onSelectPointRef.current = onSelectPoint;
  }, [onSelectPoint]);

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
  }, [onCenterChange]);

  useImperativeHandle(ref, () => ({
    focusPoint(pointId: string) {
      return focusPointOnMap(pointId);
    },
    async searchAddress(query: string) {
      const trimmedQuery = query.trim();

      if (!trimmedQuery) {
        return { success: false, message: "Informe um endereco para buscar." };
      }

      const map = mapRef.current;
      const geocoder = geocoderRef.current;
      const infoWindow = infoWindowRef.current;

      if (!map || !geocoder || !infoWindow) {
        return { success: false, message: "O mapa ainda nao terminou de carregar." };
      }

      try {
        const response = await geocoder.geocode({
          address: trimmedQuery,
          region: "BR",
        });

        const result = response.results?.[0];

        if (!result?.geometry?.location) {
          return { success: false, message: "Endereco nao encontrado." };
        }

        const location = result.geometry.location;
        const latLng = { lat: location.lat(), lng: location.lng() };

        skipNextBoundsFitRef.current = true;
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
        title.textContent = "Endereco localizado";
        address.textContent = result.formatted_address;
        address.style.margin = "0.35rem 0 0";
        content.appendChild(title);
        content.appendChild(address);

        infoWindow.setContent(content);
        infoWindow.open({
          anchor: searchLocationMarkerRef.current,
          map,
        });

        return { success: true, message: result.formatted_address };
      } catch {
        return {
          success: false,
          message: "Nao foi possivel buscar o endereco. Verifique a Geocoding API.",
        };
      }
    },
    async centerOnCurrentLocation() {
      const map = mapRef.current;

      if (!map) {
        return { success: false, message: "O mapa ainda nao terminou de carregar." };
      }

      return centerMapOnCurrentLocation(map);
    },
  }));

  useEffect(() => {
    let ignore = false;
    const pointMediaCache = pointMediaCacheRef.current;

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
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || undefined,
        });
        infoWindowRef.current = new InfoWindow();
        await centerMapOnCurrentLocation(mapRef.current);
        setIsReady(true);
      } catch (error) {
        if (!ignore) {
          setLoadError(
            error instanceof Error ? error.message : "Nao foi possivel carregar o Google Maps.",
          );
        }
      }
    }

    void initializeMap();

    return () => {
      ignore = true;
      contextMenuListenerRef.current?.remove();
      contextMenuListenerRef.current = null;
      boundsListenerRef.current?.remove();
      boundsListenerRef.current = null;
      idleListenerRef.current?.remove();
      idleListenerRef.current = null;
      markersRef.current.forEach(({ marker }) => {
        if (typeof google !== "undefined") {
          google.maps.event.clearInstanceListeners(marker);
        }
        marker.setMap(null);
      });
      markersRef.current = [];
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

    if (!map || !isReady || !onCenterChangeRef.current) {
      return;
    }

    const emitCenter = () => {
      const center = map.getCenter();

      if (!center) {
        return;
      }

      onCenterChangeRef.current?.({
        latitude: Number(center.lat().toFixed(6)),
        longitude: Number(center.lng().toFixed(6)),
      });
    };

    idleListenerRef.current = map.addListener("idle", emitCenter);
    emitCenter();

    return () => {
      idleListenerRef.current?.remove();
      idleListenerRef.current = null;
    };
  }, [isReady]);

  useEffect(() => {
    const map = mapRef.current;
    const infoWindow = infoWindowRef.current;

    if (!map || !infoWindow || !isReady) {
      return;
    }

    markersRef.current.forEach(({ marker }) => {
      google.maps.event.clearInstanceListeners(marker);
      marker.setMap(null);
    });
    markersRef.current = [];

    points.forEach((point) => {
      const marker = new google.maps.Marker({
        map,
        position: { lat: point.latitude, lng: point.longitude },
        title: point.title,
        icon: buildMarkerIcon(point, selectedPointId === point.id),
        zIndex: selectedPointId === point.id ? 1000 : 100,
      });

      marker.addListener("click", () => {
        void openPointInfoWindow(point, marker);
        onSelectPointRef.current?.(point);
      });

      markersRef.current.push({ pointId: point.id, point, marker });
    });

    if (selectedPointId) {
      const selectedEntry = markersRef.current.find((entry) => entry.pointId === selectedPointId);

      if (selectedEntry) {
        void openPointInfoWindow(selectedEntry.point, selectedEntry.marker);

        const markerPosition = selectedEntry.marker.getPosition();

        if (markerPosition) {
          skipNextBoundsFitRef.current = true;
          map.panTo(markerPosition);
          if ((map.getZoom() ?? 0) < 16) {
            map.setZoom(16);
          }
        }
      }
    } else {
      activePopupPointIdRef.current = null;
      infoWindow.close();
    }

    return () => {
      markersRef.current.forEach(({ marker }) => {
        google.maps.event.clearInstanceListeners(marker);
        marker.setMap(null);
      });
      markersRef.current = [];
    };
  }, [isReady, points, selectedPointId]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !isReady) {
      return;
    }

    if (skipNextBoundsFitRef.current) {
      skipNextBoundsFitRef.current = false;
      return;
    }

    boundsListenerRef.current?.remove();
    boundsListenerRef.current = null;

    if (!points.length) {
      map.setCenter(defaultCenter);
      map.setZoom(12);
      return;
    }

    if (points.length === 1) {
      map.setCenter({ lat: points[0].latitude, lng: points[0].longitude });
      map.setZoom(16);
      return;
    }

    const bounds = new google.maps.LatLngBounds();

    points.forEach((point) => {
      bounds.extend({ lat: point.latitude, lng: point.longitude });
    });

    boundsListenerRef.current = google.maps.event.addListenerOnce(map, "bounds_changed", () => {
      if ((map.getZoom() ?? 0) > 16) {
        map.setZoom(16);
      }
      boundsListenerRef.current = null;
    });

    map.fitBounds(bounds, 70);

    return () => {
      boundsListenerRef.current?.remove();
      boundsListenerRef.current = null;
    };
  }, [isReady, points]);

  return (
    <div className="map-stage">
      <div className="map-canvas" ref={containerRef} />
      {!isReady || loadError ? (
        <div className="map-state">
          <p className="muted">{loadError ?? "Carregando mapa do Google..."}</p>
        </div>
      ) : null}
    </div>
  );

  function focusPointOnMap(pointId: string, notifySelection = false) {
    const map = mapRef.current;
    const markerEntry = markersRef.current.find((entry) => entry.pointId === pointId);

    if (!map || !markerEntry) {
      return false;
    }

    void openPointInfoWindow(markerEntry.point, markerEntry.marker);

    const markerPosition = markerEntry.marker.getPosition();

    if (markerPosition) {
      skipNextBoundsFitRef.current = true;
      map.panTo(markerPosition);
      if ((map.getZoom() ?? 0) < 16) {
        map.setZoom(16);
      }
    }

    if (notifySelection) {
      onSelectPointRef.current?.(markerEntry.point);
    }

    return true;
  }

  async function centerMapOnCurrentLocation(map: google.maps.Map) {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return { success: false, message: "Geolocalizacao nao disponivel neste navegador." };
    }

    const position = await new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (currentPosition) => resolve(currentPosition),
        () => resolve(null),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        },
      );
    });

    if (!position) {
      return { success: false, message: "Nao foi possivel localizar sua posicao atual." };
    }

    const userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };

    skipNextBoundsFitRef.current = true;
    map.setCenter(userLocation);
    map.setZoom(Math.min((map.getZoom() ?? 12) + 5, 19));

    currentLocationMarkerRef.current?.setMap(null);
    currentLocationMarkerRef.current = new google.maps.Marker({
      map,
      position: userLocation,
      title: "Sua localizacao",
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

    return { success: true, message: "Mapa centralizado na sua posicao atual." };
  }

  async function openPointInfoWindow(point: PointRecord, marker: google.maps.Marker) {
    const map = mapRef.current;
    const infoWindow = infoWindowRef.current;

    if (!map || !infoWindow) {
      return;
    }

    activePopupPointIdRef.current = point.id;

    const cachedMedia = pointMediaCacheRef.current.get(point.id) ?? null;
    infoWindow.setContent(createPopupContent(point, cachedMedia?.[0] ?? null));
    infoWindow.open({
      anchor: marker,
      map,
    });

    if (cachedMedia) {
      return;
    }

    try {
      const media = await apiClient.getPointMedia(point.id);
      pointMediaCacheRef.current.set(point.id, media);

      if (activePopupPointIdRef.current !== point.id) {
        return;
      }

      infoWindow.setContent(createPopupContent(point, media[0] ?? null));
      infoWindow.open({
        anchor: marker,
        map,
      });
    } catch {
      pointMediaCacheRef.current.set(point.id, []);
    }
  }
});
