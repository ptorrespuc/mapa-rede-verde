/** Leitura da posicao do mapa a partir da URL (usado no servidor e no cliente). */

export interface MapViewState {
  latitude: number;
  longitude: number;
  zoom: number;
}

export function parseMapView(params: {
  lat?: string | null;
  lng?: string | null;
  z?: string | null;
}): MapViewState | null {
  const latitude = Number(params.lat);
  const longitude = Number(params.lng);
  const zoom = Number(params.z);

  if (
    !params.lat ||
    !params.lng ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    zoom: Number.isFinite(zoom) && zoom >= 2 && zoom <= 22 ? Math.round(zoom) : 17,
  };
}
