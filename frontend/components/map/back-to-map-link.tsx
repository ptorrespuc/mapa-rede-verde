"use client";

import Link from "next/link";

import { useLastMapHref } from "@/lib/map-view-state";

interface BackToMapLinkProps {
  pointId?: string | null;
  className?: string;
  children?: React.ReactNode;
}

/** Link "Voltar ao mapa" que reabre o mapa na ultima posicao vista, com o ponto selecionado. */
export function BackToMapLink({ pointId, className = "button-ghost", children }: BackToMapLinkProps) {
  const href = useLastMapHref(pointId);

  return (
    <Link className={className} href={href}>
      {children ?? "Voltar ao mapa"}
    </Link>
  );
}
