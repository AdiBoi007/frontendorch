import { clearTokens, getRefreshToken, setAccessToken, setRefreshToken } from "../auth-storage";
import { apiFetch, ApiError, BASE_URL } from "../http";

export interface AuthUser {
  id: string;
  orgId: string;
  email: string;
  displayName: string;
  globalRole: "owner" | "admin" | "member";
  workspaceRoleDefault: "manager" | "dev" | "client";
  createdAt: string;
}

interface AuthResponse {
  data: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  };
}

interface MeResponse {
  data: AuthUser;
}

export async function apiLogin(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${BASE_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  const json = (await res.json()) as AuthResponse & { error?: { code: string; message: string } };

  if (!res.ok || !json.data) {
    throw new ApiError(res.status, (json as { error?: { code: string } }).error?.code ?? "login_failed", (json as { error?: { message: string } }).error?.message ?? "Login failed");
  }

  setAccessToken(json.data.accessToken);
  setRefreshToken(json.data.refreshToken);
  return json.data.user;
}

export async function apiSignup(
  orgName: string,
  email: string,
  password: string,
  displayName: string
): Promise<AuthUser> {
  const res = await fetch(`${BASE_URL}/v1/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgName, email, password, displayName })
  });

  const json = (await res.json()) as AuthResponse & { error?: { code: string; message: string } };

  if (!res.ok || !json.data) {
    throw new ApiError(res.status, (json as { error?: { code: string } }).error?.code ?? "signup_failed", (json as { error?: { message: string } }).error?.message ?? "Signup failed");
  }

  setAccessToken(json.data.accessToken);
  setRefreshToken(json.data.refreshToken);
  return json.data.user;
}

export async function apiLogout(): Promise<void> {
  const rt = getRefreshToken();
  if (rt) {
    try {
      await apiFetch("/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: rt })
      });
    } catch {
      // Best-effort: clear locally even if server call fails
    }
  }
  clearTokens();
}

export async function apiGetMe(): Promise<AuthUser> {
  const res = await apiFetch<MeResponse>("/v1/auth/me");
  return res.data;
}
