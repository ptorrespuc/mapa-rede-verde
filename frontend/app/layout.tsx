import type { Metadata } from "next";

import { AppToaster } from "@/components/ui/app-toaster";

import "./globals.css";

export const metadata: Metadata = {
  title: "Mapa Rede Verde",
  description: "Gestao geoambiental com grupos, pontos georreferenciados e historico operacional.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
