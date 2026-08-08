import type { AuthUser } from '@alvus-ai/shared';

const ACCESS_TOKEN_KEY = 'alvus.accessToken';
const USER_KEY = 'alvus.user';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

// Full sign-in: a fresh access token plus the user it belongs to.
export function setSession(accessToken: string, user: AuthUser): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// Refreshing /auth/me updates the cached user (e.g. waitlist status changed)
// without a new token.
export function setStoredUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
