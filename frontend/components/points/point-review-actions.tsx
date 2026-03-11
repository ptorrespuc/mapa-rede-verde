"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import { PendingPointReviewModal } from "@/components/points/pending-point-review-modal";

interface PointReviewActionsProps {
  pointId: string;
  hasPendingUpdate: boolean;
  onReviewAction?: (action: "approve" | "reject") => Promise<void> | void;
}

export function PointReviewActions({
  pointId,
  hasPendingUpdate,
  onReviewAction,
}: PointReviewActionsProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewModalMode, setReviewModalMode] = useState<"preview" | "diff" | null>(null);

  async function handleReview(action: "approve" | "reject") {
    setIsSubmitting(true);

    try {
      if (onReviewAction) {
        await onReviewAction(action);
      } else {
        await apiClient.reviewPoint(pointId, action);
        toast.success(
          action === "approve"
            ? hasPendingUpdate
              ? "Alteracao aprovada."
              : "Ponto aprovado."
            : "Revisao concluida.",
        );
      }

      if (!onReviewAction) {
        router.refresh();
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel revisar o ponto.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="form-actions">
        {hasPendingUpdate ? (
          <>
            <button
              className="button-ghost"
              disabled={isSubmitting}
              onClick={() => setReviewModalMode("preview")}
              type="button"
            >
              Visualizar alteracao
            </button>
            <button
              className="button-ghost"
              disabled={isSubmitting}
              onClick={() => setReviewModalMode("diff")}
              type="button"
            >
              Visualizar diferencas
            </button>
          </>
        ) : null}
        <button
          className="button-secondary"
          disabled={isSubmitting}
          onClick={() => void handleReview("approve")}
          type="button"
        >
          {hasPendingUpdate ? "Aprovar alteracao" : "Aprovar ponto"}
        </button>
        <button
          className="button-ghost danger"
          disabled={isSubmitting}
          onClick={() => void handleReview("reject")}
          type="button"
        >
          {hasPendingUpdate ? "Rejeitar alteracao" : "Rejeitar ponto"}
        </button>
      </div>
      {reviewModalMode ? (
        <PendingPointReviewModal
          hasPendingUpdate={hasPendingUpdate}
          initialMode={reviewModalMode}
          isReviewing={isSubmitting}
          onClose={() => setReviewModalMode(null)}
          onReviewAction={async (action) => {
            const didSucceed = await handleReview(action);

            if (didSucceed) {
              setReviewModalMode(null);
            }
          }}
          pointId={pointId}
        />
      ) : null}
    </>
  );
}
