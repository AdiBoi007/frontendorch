const REFRESH_KEY = "orchestra_rt";

let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setRefreshToken(token: string | null) {
  if (token === null) {
    localStorage.removeItem(REFRESH_KEY);
  } else {
    localStorage.setItem(REFRESH_KEY, token);
  }
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function clearTokens() {
  _accessToken = null;
  localStorage.removeItem(REFRESH_KEY);
}
