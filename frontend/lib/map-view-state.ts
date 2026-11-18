"use client";

import { useEffect, useState } from "react";

import type { MapViewState } from "@/lib/map-view-params";

export type { MapViewState } from "@/lib/map-view-params";
export { parseMapView } from "@/lib/map-view-params";

/**
 * Estado de navegacao do mapa: posicao (centro + zoom), ponto selecionado e filtros rapidos.
 *
 * - A posicao e o ponto ficam na URL (/map?lat=..&lng=..&z=..&ponto=..), entao "voltar",
 *   recarregar e compartilhar o link reabrem o mapa exatamente no mesmo lugar.
 * - A ultima URL do mapa fica no sessionStorage, para que os links "Voltar ao mapa"
 *   (detalhe, edicao, menu) retornem a ela em vez de abrir o mapa do zero.
 * - Os filtros rapidos ficam no sessionStorage da aba.
 */

export interface StoredMapFilters {
  classificationIds: string[];
  pendingOnly: boolean;
  mineOnly: boolean;
}

const LAST_MAP_URL_KEY = "mrv_last_map_url";
const MAP_FILTERS_KEY = "mrv_map_filters";
const MAP_PATH = "/map";

function safeSessionGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Navegacao privada ou armazenamento bloqueado: segue sem lembrar.
  }
}

/** Atualiza a URL do mapa sem recarregar a pagina e lembra dela para os links de volta. */
export function syncMapUrl(update: { view?: MapViewState | null; pointId?: string | null }) {
  if (typeof window === "undefined" || window.location.pathname !== MAP_PATH) {
    return;
  }

  const url = new URL(window.location.href);

  if (update.view !== undefined) {
    if (update.view) {
      url.searchParams.set("lat", update.view.latitude.toFixed(6));
      url.searchParams.set("lng", update.view.longitude.toFixed(6));
      url.searchParams.set("z", String(Math.round(update.view.zoom)));
    } else {
      url.searchParams.delete("lat");
      url.searchParams.delete("lng");
      url.searchParams.delete("z");
    }
  }

  if (update.pointId !== undefined) {
    if (update.pointId) {
      url.searchParams.set("ponto", update.pointId);
    } else {
      url.searchParams.delete("ponto");
    }
  }

  const next = `${url.pathname}${url.search}`;

  if (next !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(window.history.state, "", next);
  }

  safeSessionSet(LAST_MAP_URL_KEY, next);
}

export function getLastMapHref(pointId?: string | null) {
  if (typeof window === "undefined") {
    return MAP_PATH;
  }

  const stored = safeSessionGet(LAST_MAP_URL_KEY);
  const base = stored && stored.startsWith(MAP_PATH) ? stored : MAP_PATH;

  if (!pointId) {
    return base;
  }

  const url = new URL(base, window.location.origin);
  url.searchParams.set("ponto", pointId);
  return `${url.pathname}${url.search}`;
}

/** Href do mapa que lembra a ultima posicao. Comeca em /map no servidor e se ajusta no cliente. */
export function useLastMapHref(pointId?: string | null) {
  const [href, setHref] = useState(MAP_PATH);

  useEffect(() => {
    setHref(getLastMapHref(pointId));
  }, [pointId]);

  return href;
}

export function loadMapFilters(): StoredMapFilters | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = safeSessionGet(MAP_FILTERS_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredMapFilters>;

    return {
      classificationIds: Array.isArray(parsed.classificationIds)
        ? parsed.classificationIds.filter((value): value is string => typeof value === "string")
        : [],
      pendingOnly: Boolean(parsed.pendingOnly),
      mineOnly: Boolean(parsed.mineOnly),
    };
  } catch {
    return null;
  }
}

export function saveMapFilters(filters: StoredMapFilters) {
  if (typeof window === "undefined") {
    return;
  }

  safeSessionSet(MAP_FILTERS_KEY, JSON.stringify(filters));
}
