"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";

interface DeletePointButtonProps {
  pointId: string;
  redirectTo?: string;
  initialLabel?: string;
}

export function DeletePointButton({
  pointId,
  redirectTo = "/map",
  initialLabel = "Arquivar ponto",
}: DeletePointButtonProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);

    try {
      await apiClient.deletePoint(pointId);
      toast.success("Ponto arquivado com sucesso.");
      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel arquivar o ponto.";
      toast.error(message);
      setIsDeleting(false);
    }
  }

  if (isConfirming) {
    return (
      <>
        <button
          className="button-ghost danger"
          disabled={isDeleting}
          onClick={handleDelete}
          type="button"
        >
          {isDeleting ? "Arquivando..." : "Confirmar arquivamento"}
        </button>
        <button
          className="button-ghost"
          disabled={isDeleting}
          onClick={() => setIsConfirming(false)}
          type="button"
        >
          Cancelar
        </button>
      </>
    );
  }

  return (
    <button
      className="button-ghost danger"
      disabled={isDeleting}
      onClick={() => setIsConfirming(true)}
      type="button"
    >
      {initialLabel}
    </button>
  );
}
