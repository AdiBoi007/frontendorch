import { AppError } from "../../app/errors.js";

export function parseRetryAfterMs(retryAfter: string | null | undefined) {
  if (!retryAfter) {
    return null;
  }

  const numericSeconds = Number(retryAfter);
  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return numericSeconds * 1000;
  }

  const dateMs = Date.parse(retryAfter);
  if (Number.isFinite(dateMs)) {
    return Math.max(dateMs - Date.now(), 0);
  }

  return null;
}

export function providerRateLimitError(provider: string, operation: string, retryAfterHeader?: string | null) {
  return new AppError(
    429,
    `${provider} rate limited ${operation}`,
    "communication_provider_rate_limited",
    {
      provider,
      operation,
      retryAfterMs: parseRetryAfterMs(retryAfterHeader)
    }
  );
}

export function providerApiError(
  provider: string,
  operation: string,
  message: string,
  statusCode = 502,
  details?: Record<string, unknown>
) {
  return new AppError(statusCode, message, `${provider}_api_error`, {
    provider,
    operation,
    ...(details ?? {})
  });
}
