import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.pucrio.maparedeverde",
  appName: "Mapa Rede Verde",
  webDir: "mobile-shell",
  server: {
    url: "https://mapa-rede-verde.vercel.app",
    cleartext: false,
    androidScheme: "https",
    allowNavigation: ["mapa-rede-verde.vercel.app"],
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
