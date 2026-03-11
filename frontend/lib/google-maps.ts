import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let isGoogleMapsConfigured = false;

export async function loadGoogleMapsLibraries() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Configure NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para carregar o Google Maps.");
  }

  if (!isGoogleMapsConfigured) {
    const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim();

    setOptions({
      key: apiKey,
      language: "pt-BR",
      region: "BR",
      ...(mapId ? { mapIds: [mapId] } : {}),
    });

    isGoogleMapsConfigured = true;
  }

  const { Map, InfoWindow } = (await importLibrary("maps")) as google.maps.MapsLibrary;
  const { Geocoder } = (await importLibrary("geocoding")) as google.maps.GeocodingLibrary;

  return { Map, InfoWindow, Geocoder };
}
