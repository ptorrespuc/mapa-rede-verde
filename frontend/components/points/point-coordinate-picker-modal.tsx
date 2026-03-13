"use client";

import { Crosshair, LocateFixed, MapPinned, Search, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MapCanvas, type MapCanvasHandle } from "@/components/map/map-canvas";

interface CoordinateValue {
  latitude: number;
  longitude: number;
}

interface PointCoordinatePickerModalProps {
  isOpen: boolean;
  initialCoordinates?: CoordinateValue | null;
  onClose: () => void;
  onConfirm: (coordinates: CoordinateValue) => void;
}

function formatCoordinateLabel(coordinates: CoordinateValue | null) {
  if (!coordinates) {
    return "Arraste o mapa ou use sua localizacao para definir o novo ponto.";
  }

  return `Latitude ${coordinates.latitude.toFixed(6)} | Longitude ${coordinates.longitude.toFixed(6)}`;
}

export function PointCoordinatePickerModal({
  isOpen,
  initialCoordinates,
  onClose,
  onConfirm,
}: PointCoordinatePickerModalProps) {
  const mapRef = useRef<MapCanvasHandle | null>(null);
  const [addressQuery, setAddressQuery] = useState("");
  const [mapCenter, setMapCenter] = useState<CoordinateValue | null>(initialCoordinates ?? null);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isCenteringOnCurrentLocation, setIsCenteringOnCurrentLocation] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setAddressQuery("");
    setMapCenter(initialCoordinates ?? null);
  }, [initialCoordinates, isOpen]);

  if (!isOpen) {
    return null;
  }

  async function handleAddressSearch(event: FormEvent<HTMLFormElement>) {
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

  function handleMapSelection(coordinates: CoordinateValue) {
    onConfirm(coordinates);
    onClose();
  }

  function handleConfirmFromCenter() {
    if (!mapCenter) {
      toast.error("Espere o mapa carregar ou mova a tela para definir o centro.");
      return;
    }

    handleMapSelection(mapCenter);
  }

  return (
    <div className="modal-overlay coordinate-picker-overlay" role="dialog" aria-modal="true">
      <div className="modal-card coordinate-picker-modal stack-md">
        <div className="modal-header">
          <div className="modal-header-top">
            <div className="stack-xs">
              <p className="eyebrow">Buscar no mapa</p>
              <h2 className="section-title">Ajustar coordenadas do ponto</h2>
            </div>
            <button
              aria-label="Fechar seletor de coordenadas"
              className="modal-close-button"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <p className="subtitle">
            O mapa abre centralizado na posicao atual do ponto. No computador, clique com o botao
            direito para atualizar. No celular, arraste o mapa e use o centro da tela.
          </p>
        </div>

        <div className="coordinate-picker-toolbar">
          <form className="map-search-form coordinate-picker-search" onSubmit={handleAddressSearch}>
            <label className="toolbar-label" htmlFor="point-coordinate-address-search">
              <Search aria-hidden="true" size={15} />
              <span>Buscar endereco</span>
            </label>
            <div className="map-search-row">
              <input
                id="point-coordinate-address-search"
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

          <div className="surface-subtle coordinate-picker-status">
            <div className="stack-xs">
              <span className="muted">Centro atual do mapa</span>
              <strong>{formatCoordinateLabel(mapCenter)}</strong>
            </div>
            <button
              className="button-ghost button-inline-ghost"
              disabled={isCenteringOnCurrentLocation}
              onClick={() => void handleCenterOnCurrentLocation()}
              type="button"
            >
              <LocateFixed aria-hidden="true" size={15} />
              {isCenteringOnCurrentLocation ? "Localizando..." : "Minha posicao"}
            </button>
          </div>
        </div>

        <div className="map-creation-hint" role="note">
          <span className="desktop-only">
            Clique com o botao direito no mapa para usar imediatamente a nova coordenada.
          </span>
          <span className="mobile-only">
            Arraste o mapa ate o local desejado. O alvo central indica a coordenada que sera
            aplicada ao tocar no botao abaixo.
          </span>
        </div>

        <section className="panel map-panel coordinate-picker-map-panel">
          <MapCanvas
            ref={mapRef}
            autoCenterOnCurrentLocation={!initialCoordinates}
            initialCenter={initialCoordinates}
            initialZoom={18}
            onCenterChange={setMapCenter}
            onMapContextMenu={handleMapSelection}
            points={[]}
          />
          <div aria-hidden="true" className="map-center-target">
            <span className="map-center-target-dot" />
          </div>
          <div className="map-center-caption mobile-only" role="note">
            Novo centro pronto para atualizar a coordenada
          </div>
        </section>

        <div className="form-actions coordinate-picker-actions">
          <button className="button" onClick={handleConfirmFromCenter} type="button">
            <Crosshair aria-hidden="true" size={16} />
            Alterar coordenada
          </button>
          <button className="button-ghost" onClick={onClose} type="button">
            <MapPinned aria-hidden="true" size={16} />
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
