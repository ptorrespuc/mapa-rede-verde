import "server-only";

import { NextResponse } from "next/server";

export interface ApiRouteLogContext {
  route: string;
  action: string;
  actorAuthUserId?: string | null;
  pointId?: string | null;
  groupId?: string | null;
}

interface ApiRouteErrorOptions {
  status?: number;
  code?: string;
  details?: unknown;
  cause?: unknown;
}

interface NormalizeApiErrorFallback {
  status?: number;
  code?: string;
  message?: string;
  details?: unknown;
}

interface NormalizedApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

type ErrorLike = {
  message?: unknown;
  status?: unknown;
  code?: unknown;
  details?: unknown;
};

export class ApiRouteError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(message: string, options: ApiRouteErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "ApiRouteError";
    this.status = options.status ?? 500;
    this.code = options.code ?? defaultErrorCode(this.status);
    this.details = options.details;
  }
}

export function buildApiErrorResponse(
  error: unknown,
  context: ApiRouteLogContext,
  fallback: NormalizeApiErrorFallback = {},
) {
  const normalized = normalizeApiError(error, fallback);
  const payload: Record<string, unknown> = {
    error: normalized.message,
    code: normalized.code,
  };

  if (typeof normalized.details !== "undefined") {
    payload.details = normalized.details;
  }

  logApiRouteError(normalized, context);

  return NextResponse.json(payload, { status: normalized.status });
}

export function requireAuthenticatedUser(userId: string | null | undefined) {
  if (!userId) {
    throw new ApiRouteError("Nao autenticado.", {
      status: 401,
      code: "AUTH_REQUIRED",
    });
  }

  return userId;
}

function normalizeApiError(
  error: unknown,
  fallback: NormalizeApiErrorFallback,
): NormalizedApiError {
  if (error instanceof ApiRouteError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  const errorLike = isErrorLike(error) ? error : null;
  const message =
    typeof errorLike?.message === "string" && errorLike.message.trim()
      ? errorLike.message
      : error instanceof Error && error.message.trim()
        ? error.message
        : fallback.message ?? "Erro interno ao processar a requisicao.";
  const fallbackStatus = fallback.status ?? inferStatusFromMessage(message);
  const status =
    typeof errorLike?.status === "number" ? errorLike.status : fallbackStatus;
  const code =
    typeof errorLike?.code === "string" && errorLike.code.trim()
      ? errorLike.code
      : fallback.code ?? defaultErrorCode(status);
  const details =
    typeof errorLike?.details !== "undefined"
      ? errorLike.details
      : fallback.details;

  return {
    status,
    code,
    message,
    details,
  };
}

function isErrorLike(error: unknown): error is ErrorLike {
  return Boolean(error) && typeof error === "object";
}

function inferStatusFromMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("nao autenticado") || normalized.includes("não autenticado")) {
    return 401;
  }

  if (
    normalized.includes("nao tem permissao") ||
    normalized.includes("não tem permissão") ||
    normalized.includes("forbidden") ||
    normalized.includes("permission denied")
  ) {
    return 403;
  }

  if (normalized.includes("nao encontrado") || normalized.includes("não encontrado")) {
    return 404;
  }

  if (
    normalized.includes("duplicate") ||
    normalized.includes("already exists") ||
    normalized.includes("ja existe") ||
    normalized.includes("já existe")
  ) {
    return 409;
  }

  return 500;
}

function defaultErrorCode(status: number) {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "AUTH_REQUIRED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    default:
      return "INTERNAL_ERROR";
  }
}

function logApiRouteError(
  error: NormalizedApiError,
  context: ApiRouteLogContext,
) {
  const payload = {
    route: context.route,
    action: context.action,
    actorAuthUserId: context.actorAuthUserId ?? null,
    pointId: context.pointId ?? null,
    groupId: context.groupId ?? null,
    status: error.status,
    code: error.code,
    errorMessage: error.message,
  };

  if (error.status >= 500) {
    console.error("[api-route-error]", payload);
    return;
  }

  console.warn("[api-route-error]", payload);
}
