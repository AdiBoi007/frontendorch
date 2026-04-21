import type { AppEnv } from "../../config/env.js";
import { AppError } from "../../app/errors.js";
import { parseRetryAfterMs, providerApiError, providerRateLimitError } from "./provider-http.js";

type FetchLike = typeof fetch;

export type MicrosoftCredential = {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  tokenType?: string;
  scope?: string;
  accountLabel?: string;
  userId?: string;
};

function microsoftTenant(env: AppEnv) {
  return env.MICROSOFT_TENANT_ID || "common";
}

export function buildMicrosoftOAuthUrl(env: AppEnv, state: string, scopes: string[]) {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET || !env.MICROSOFT_REDIRECT_URI) {
    throw new AppError(503, "Microsoft OAuth is not configured", "microsoft_oauth_not_configured");
  }

  const url = new URL(`https://login.microsoftonline.com/${microsoftTenant(env)}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", env.MICROSOFT_REDIRECT_URI);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeMicrosoftCode(
  env: AppEnv,
  fetchImpl: FetchLike,
  code: string,
  scopes: string[]
) {
  const response = await fetchImpl(
    `https://login.microsoftonline.com/${microsoftTenant(env)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID ?? "",
        client_secret: env.MICROSOFT_CLIENT_SECRET ?? "",
        grant_type: "authorization_code",
        code,
        redirect_uri: env.MICROSOFT_REDIRECT_URI ?? "",
        scope: scopes.join(" ")
      })
    }
  );

  if (response.status === 429) {
    throw providerRateLimitError("microsoft", "oauth_token_exchange", response.headers.get("retry-after"));
  }

  const payload = (await response.json()) as Record<string, any>;
  if (!response.ok) {
    throw providerApiError(
      "microsoft",
      "oauth_token_exchange",
      payload.error_description ?? payload.error ?? "Microsoft OAuth callback failed",
      response.status
    );
  }

  return {
    accessToken: payload.access_token as string,
    refreshToken: payload.refresh_token as string | undefined,
    expiryDate: typeof payload.expires_in === "number" ? Date.now() + payload.expires_in * 1000 : undefined,
    tokenType: payload.token_type as string | undefined,
    scope: payload.scope as string | undefined
  };
}

export async function refreshMicrosoftAccessToken(
  env: AppEnv,
  fetchImpl: FetchLike,
  credential: MicrosoftCredential,
  scopes: string[]
) {
  if (!credential.refreshToken) {
    throw new AppError(409, "Microsoft connector refresh token is missing", "microsoft_refresh_token_missing");
  }

  const response = await fetchImpl(
    `https://login.microsoftonline.com/${microsoftTenant(env)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID ?? "",
        client_secret: env.MICROSOFT_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: credential.refreshToken,
        redirect_uri: env.MICROSOFT_REDIRECT_URI ?? "",
        scope: scopes.join(" ")
      })
    }
  );

  if (response.status === 429) {
    throw providerRateLimitError("microsoft", "token_refresh", response.headers.get("retry-after"));
  }

  const payload = (await response.json()) as Record<string, any>;
  if (!response.ok) {
    throw providerApiError(
      "microsoft",
      "token_refresh",
      payload.error_description ?? payload.error ?? "Microsoft token refresh failed",
      response.status
    );
  }

  return {
    accessToken: payload.access_token as string,
    refreshToken: (payload.refresh_token as string | undefined) ?? credential.refreshToken,
    expiryDate: typeof payload.expires_in === "number" ? Date.now() + payload.expires_in * 1000 : undefined,
    tokenType: payload.token_type as string | undefined,
    scope: (payload.scope as string | undefined) ?? credential.scope
  };
}

export async function callMicrosoftGraph<TPayload>(
  fetchImpl: FetchLike,
  credential: MicrosoftCredential,
  pathOrUrl: string,
  init?: RequestInit
) {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `https://graph.microsoft.com/v1.0${pathOrUrl}`;
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      authorization: `Bearer ${credential.accessToken}`,
      ...(init?.headers ?? {})
    }
  });

  if (response.status === 429) {
    throw providerRateLimitError("microsoft", url, response.headers.get("retry-after"));
  }

  if (!response.ok) {
    const text = await response.text();
    throw providerApiError("microsoft", url, text || `Microsoft Graph request failed`, response.status, {
      retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after"))
    });
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as TPayload;
}
