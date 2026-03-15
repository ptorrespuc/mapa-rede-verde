"use client";

import Link from "next/link";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

import type { FlashFeedbackPayload } from "@/lib/flash-feedback";

interface FeedbackBannerProps {
  feedback: FlashFeedbackPayload;
  onDismiss?: () => void;
}

export function FeedbackBanner({ feedback, onDismiss }: FeedbackBannerProps) {
  const variant = feedback.variant ?? "success";
  const Icon =
    variant === "error" ? TriangleAlert : variant === "info" ? Info : CheckCircle2;

  return (
    <section
      className={`feedback-banner feedback-banner-${variant}`}
      role={variant === "error" ? "alert" : "status"}
    >
      <div className="feedback-banner-copy">
        <div className="feedback-banner-title">
          <Icon aria-hidden="true" size={18} />
          <strong>{feedback.title}</strong>
        </div>
        {feedback.message ? <p>{feedback.message}</p> : null}
      </div>
      <div className="feedback-banner-actions">
        {feedback.actionHref && feedback.actionLabel ? (
          <Link className="button-ghost compact" href={feedback.actionHref}>
            {feedback.actionLabel}
          </Link>
        ) : null}
        {onDismiss ? (
          <button
            aria-label="Fechar aviso"
            className="feedback-banner-close"
            onClick={onDismiss}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        ) : null}
      </div>
    </section>
  );
}
