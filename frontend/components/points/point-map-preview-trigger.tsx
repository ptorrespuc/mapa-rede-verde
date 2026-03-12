"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, MapPinned, X } from "lucide-react";

import { loadGoogleMapsLibraries } from "@/lib/google-maps";
import { getPointDisplayColor } from "@/lib/point-display";
import type { PointRecord } from "@/types/domain";

type PointMapPreviewPoint = Pick<
  PointRecord,
  | "id"
  | "title"
  | "group_name"
  | "group_code"
  | "classification_name"
  | "classification_requires_species"
  | "species_name"
  | "latitude"
  | "longitude"
  | "approval_status"
  | "has_pending_update"
>;

interface PointMapPreviewTriggerProps {
  point: PointMapPreviewPoint;
  variant?: "icon" | "text";
  label?: string;
  className?: string;
}

export function PointMapPreviewTrigger({
  point,
  variant = "icon",
  label = "Visualizar no mapa",
  className,
}: PointMapPreviewTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadMap() {
      if (!isOpen || !mapContainerRef.current) {
        return;
      }

      setIsLoading(true);
      setLoadError(null);

      try {
        const { Map } = await loadGoogleMapsLibraries();

        if (ignore || !mapContainerRef.current) {
          return;
        }

        const position = { lat: point.latitude, lng: point.longitude };

        if (!mapRef.current) {
          mapRef.current = new Map(mapContainerRef.current, {
            center: position,
            zoom: 18,
            clickableIcons: false,
            fullscreenControl: false,
            mapTypeControl: false,
            streetViewControl: false,
            mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || undefined,
          });
        } else {
          mapRef.current.setCenter(position);
          mapRef.current.setZoom(18);
        }

        markerRef.current?.setMap(null);
        markerRef.current = new google.maps.Marker({
          map: mapRef.current,
          position,
          title: point.title,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: getPointDisplayColor(point as PointRecord),
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeOpacity: 1,
            strokeWeight: 2,
            scale: 7,
          },
        });
      } catch (error) {
        if (!ignore) {
          setLoadError(
            error instanceof Error ? error.message : "Nao foi possivel carregar o mapa.",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadMap();

    return () => {
      ignore = true;
    };
  }, [isOpen, point]);

  useEffect(() => {
    return () => {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  return (
    <>
      {variant === "icon" ? (
        <button
          aria-label={label}
          className={className ?? "button-ghost icon-button"}
          onClick={() => setIsOpen(true)}
          title={label}
          type="button"
        >
          <Eye aria-hidden="true" size={16} />
        </button>
      ) : (
        <button
          className={className ?? "button-inline-ghost button-ghost"}
          onClick={() => setIsOpen(true)}
          type="button"
        >
          <MapPinned aria-hidden="true" size={16} />
          {label}
        </button>
      )}

      {isOpen ? (
        <div aria-modal="true" className="modal-overlay" role="dialog">
          <div className="modal-card stack-md">
            <div className="modal-header">
              <div className="modal-header-top">
                <div className="stack-xs">
                  <p className="eyebrow">Mapa rapido</p>
                  <h2 className="section-title">{point.title}</h2>
                  <p className="subtitle">
                    {point.group_name} | {point.classification_name}
                  </p>
                </div>
                <button
                  aria-label="Fechar janela"
                  className="modal-close-button"
                  onClick={() => setIsOpen(false)}
                  type="button"
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
            </div>

            <div className="point-map-preview-meta">
              {point.classification_requires_species && point.species_name ? (
                <span className="badge">{point.species_name}</span>
              ) : null}
              <span className="badge">
                {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
              </span>
            </div>

            <div className="point-map-preview-shell">
              <div className="point-map-preview-canvas" ref={mapContainerRef} />
              {isLoading || loadError ? (
                <div className="map-state point-map-preview-state">
                  <p className="muted">{loadError ?? "Carregando mapa..."}</p>
                </div>
              ) : null}
            </div>

            <div className="form-actions">
              <button className="button-ghost" onClick={() => setIsOpen(false)} type="button">
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
