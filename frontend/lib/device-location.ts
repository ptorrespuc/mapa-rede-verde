"use client";

import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export interface DeviceLocationResult {
  success: boolean;
  message?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

const defaultOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 60000,
};

function getErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : null;

  if (!message) {
    return "Não foi possível acessar sua localização atual.";
  }

  if (/denied|negad|0003/i.test(message)) {
    return "Permissao de localização negada no aplicativo.";
  }

  if (/disabled|desativad|0007|0016|0017/i.test(message)) {
    return "Ative a localização do aparelho para continuar.";
  }

  if (/timeout|0010/i.test(message)) {
    return "A localização demorou mais que o esperado. Tente novamente.";
  }

  return "Não foi possível acessar sua localização atual.";
}

async function getNativeDeviceLocation(): Promise<DeviceLocationResult> {
  try {
    const permissionState = await Geolocation.checkPermissions();

    if (permissionState.location !== "granted") {
      const requestState = await Geolocation.requestPermissions({
        permissions: ["location"],
      });

      if (requestState.location !== "granted") {
        return {
          success: false,
          message: "Permissao de localização negada no aplicativo.",
        };
      }
    }

    const position = await Geolocation.getCurrentPosition({
      ...defaultOptions,
      enableLocationFallback: true,
    });

    return {
      success: true,
      coordinates: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error),
    };
  }
}

async function getBrowserLocation(): Promise<DeviceLocationResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      success: false,
      message: "Geolocalizacao não disponível neste navegador.",
    };
  }

  const position = await new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (currentPosition) => resolve(currentPosition),
      () => resolve(null),
      defaultOptions,
    );
  });

  if (!position) {
    return {
      success: false,
      message: "Não foi possível localizar sua posição atual.",
    };
  }

  return {
    success: true,
    coordinates: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    },
  };
}

export async function getCurrentDeviceLocation(): Promise<DeviceLocationResult> {
  if (Capacitor.isNativePlatform()) {
    return getNativeDeviceLocation();
  }

  return getBrowserLocation();
}
