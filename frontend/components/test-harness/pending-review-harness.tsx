"use client";

import { PendingPointReviewModal } from "@/components/points/pending-point-review-modal";

export function PendingReviewHarness() {
  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Harness</p>
          <h1>Revisao de alteracao pendente</h1>
          <p className="subtitle">
            Ambiente isolado para validar a visualizacao da alteracao e das fotos pendentes.
          </p>
        </div>
      </div>

      <PendingPointReviewModal
        initialMode="diff"
        onClose={() => undefined}
        pointId="playwright-point"
      />
    </section>
  );
}
