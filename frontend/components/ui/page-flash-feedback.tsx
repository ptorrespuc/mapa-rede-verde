"use client";

import { useEffect, useState } from "react";

import { FeedbackBanner } from "@/components/ui/feedback-banner";
import {
  consumeFlashFeedback,
  type FlashFeedbackPayload,
} from "@/lib/flash-feedback";

interface PageFlashFeedbackProps {
  scope: string;
}

export function PageFlashFeedback({ scope }: PageFlashFeedbackProps) {
  const [feedback, setFeedback] = useState<FlashFeedbackPayload | null>(null);

  useEffect(() => {
    setFeedback(consumeFlashFeedback(scope));
  }, [scope]);

  if (!feedback) {
    return null;
  }

  return <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} />;
}
