/// <reference types="vite/client" />
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken, setRefreshToken } from "./auth-storage";

export const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Single-flight refresh promise — prevents concurrent 401s from firing multiple refreshes
let _refreshPromise: Promise<string> | null = null;

async function runRefresh(): Promise<string> {
  const rt = getRefreshToken();
  if (!rt) {
    throw new ApiError(401, "no_refresh_token", "No refresh token");
  }

  const res = await fetch(`${BASE_URL}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: rt })
  });

  const json = (await res.json()) as { data?: { accessToken: string; refreshToken: string }; error?: { code: string; message: string } };

  if (!res.ok || !json.data) {
    clearTokens();
    throw new ApiError(res.status, json.error?.code ?? "refresh_failed", json.error?.message ?? "Refresh failed");
  }

  setAccessToken(json.data.accessToken);
  setRefreshToken(json.data.refreshToken);
  return json.data.accessToken;
}

async function refreshAccessToken(): Promise<string> {
  if (!_refreshPromise) {
    _refreshPromise = runRefresh().finally(() => {
      _refreshPromise = null;
    });
  }
  return _refreshPromise;
}

// Upload variant: does NOT set Content-Type so the browser sets multipart/form-data boundary automatically.
export async function apiUploadFetch<T>(path: string, formData: FormData): Promise<T> {
  const headers = new Headers();
  const at = getAccessToken();
  if (at) headers.set("Authorization", `Bearer ${at}`);

  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: formData });

  if (res.status === 401) {
    let newAt: string;
    try {
      newAt = await refreshAccessToken();
    } catch {
      clearTokens();
      window.dispatchEvent(new CustomEvent("orchestra:auth-expired"));
      throw new ApiError(401, "session_expired", "Session expired");
    }
    headers.set("Authorization", `Bearer ${newAt}`);
    const retried = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: formData });
    if (!retried.ok) {
      const body = (await retried.json().catch(() => ({}))) as { error?: { code: string; message: string } };
      throw new ApiError(retried.status, body.error?.code ?? "upload_failed", body.error?.message ?? "Upload failed");
    }
    return (await retried.json()) as T;
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
    throw new ApiError(res.status, body.error?.code ?? "upload_failed", body.error?.message ?? "Upload failed");
  }

  return (await res.json()) as T;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  const at = getAccessToken();
  if (at) headers.set("Authorization", `Bearer ${at}`);

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401) {
    // Attempt single refresh then retry once
    let newAt: string;
    try {
      newAt = await refreshAccessToken();
    } catch {
      clearTokens();
      window.dispatchEvent(new CustomEvent("orchestra:auth-expired"));
      throw new ApiError(401, "session_expired", "Session expired");
    }

    headers.set("Authorization", `Bearer ${newAt}`);
    const retried = await fetch(`${BASE_URL}${path}`, { ...init, headers });

    if (!retried.ok) {
      const body = (await retried.json().catch(() => ({}))) as { error?: { code: string; message: string } };
      throw new ApiError(retried.status, body.error?.code ?? "request_failed", body.error?.message ?? "Request failed");
    }

    return (await retried.json()) as T;
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
    throw new ApiError(res.status, body.error?.code ?? "request_failed", body.error?.message ?? "Request failed");
  }

  return (await res.json()) as T;
}