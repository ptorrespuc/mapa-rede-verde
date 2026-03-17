const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

interface GoogleGeocodingResponse {
  results?: {
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }[];
  status?: string;
  error_message?: string;
}

export interface GeocodeAddressResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

export async function geocodeAddress(query: string): Promise<GeocodeAddressResult> {
  if (!googleMapsApiKey) {
    throw new Error("Defina EXPO_PUBLIC_GOOGLE_MAPS_API_KEY para usar a busca por endereco.");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", googleMapsApiKey);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error("Nao foi possivel consultar o servico de geocodificacao.");
  }

  const payload = (await response.json()) as GoogleGeocodingResponse;
  const result = payload.results?.[0];

  if (!result) {
    throw new Error(payload.error_message || "Endereco nao encontrado.");
  }

  return {
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
  };
}
