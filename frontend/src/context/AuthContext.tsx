import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiGetMe, apiLogin, apiLogout, apiSignup, type AuthUser } from "../lib/api/auth";
import { clearTokens, getRefreshToken, setAccessToken, setRefreshToken } from "../lib/auth-storage";
import { ApiError, BASE_URL } from "../lib/http";

export type AuthStatus = "bootstrapping" | "authenticated" | "unauthenticated" | "error";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (orgName: string, email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function tryBootstrap(): Promise<AuthUser | null> {
  const rt = getRefreshToken();
  if (!rt) return null;

  // Try to get a fresh access token via refresh first
  try {
    const res = await fetch(`${BASE_URL}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt })
    });

    const json = (await res.json()) as { data?: { accessToken: string; refreshToken: string }; error?: unknown };

    if (!res.ok || !json.data) {
      clearTokens();
      return null;
    }

    setAccessToken(json.data.accessToken);
    setRefreshToken(json.data.refreshToken);
  } catch {
    clearTokens();
    return null;
  }

  // Then load current user
  try {
    return await apiGetMe();
  } catch {
    clearTokens();
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "bootstrapping",
    user: null,
    error: null
  });

  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    void (async () => {
      const user = await tryBootstrap();
      setState(
        user
          ? { status: "authenticated", user, error: null }
          : { status: "unauthenticated", user: null, error: null }
      );
    })();
  }, []);

  // Listen for session expiry dispatched by http.ts refresh failures
  useEffect(() => {
    const handler = () => {
      setState({ status: "unauthenticated", user: null, error: null });
    };
    window.addEventListener("orchestra:auth-expired", handler);
    return () => window.removeEventListener("orchestra:auth-expired", handler);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const user = await apiLogin(email, password);
      setState({ status: "authenticated", user, error: null });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Login failed";
      setState((prev) => ({ ...prev, error: msg }));
      throw err;
    }
  }, []);

  const signup = useCallback(async (orgName: string, email: string, password: string, displayName: string) => {
    try {
      const user = await apiSignup(orgName, email, password, displayName);
      setState({ status: "authenticated", user, error: null });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Signup failed";
      setState((prev) => ({ ...prev, error: msg }));
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setState({ status: "unauthenticated", user: null, error: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Re-export for convenience
export type { AuthUser };
