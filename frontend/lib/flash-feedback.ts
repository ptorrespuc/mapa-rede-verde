"use client";

export interface FlashFeedbackPayload {
  title: string;
  message?: string;
  variant?: "success" | "info" | "error";
  actionHref?: string;
  actionLabel?: string;
  scope?: string;
}

const FLASH_FEEDBACK_KEY = "mrv_flash_feedback";

function matchesScope(currentScope: string, expectedScope?: string) {
  if (!expectedScope) {
    return true;
  }

  return currentScope === expectedScope;
}

export function storeFlashFeedback(payload: FlashFeedbackPayload) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(FLASH_FEEDBACK_KEY, JSON.stringify(payload));
}

export function consumeFlashFeedback(scope: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(FLASH_FEEDBACK_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const payload = JSON.parse(rawValue) as FlashFeedbackPayload;

    if (!matchesScope(scope, payload.scope)) {
      return null;
    }

    window.sessionStorage.removeItem(FLASH_FEEDBACK_KEY);
    return payload;
  } catch {
    window.sessionStorage.removeItem(FLASH_FEEDBACK_KEY);
    return null;
  }
}
