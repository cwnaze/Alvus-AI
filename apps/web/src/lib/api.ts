import type { AuthUser, LoginResponse, RefreshResponse, WaitlistEntriesResponse } from '@alvus-ai/shared';
import { clearSession, getAccessToken, getRefreshToken, setTokens } from './session';

type ApiErrorBody = { error: { code: string; message: string; correlationId: string } };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Shared across concurrent 401s so a burst of requests refreshes once, not once
// per request.
let inFlightRefresh: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  if (!inFlightRefresh) {
    inFlightRefresh = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as RefreshResponse;
        setTokens(body.access_token, body.refresh_token);
        return true;
      } catch {
        return false;
      } finally {
        inFlightRefresh = null;
      }
    })();
  }
  return inFlightRefresh;
}

async function request<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...init, headers });

  if (!res.ok) {
    // A 401 on an expired (but not revoked) access token is recoverable via
    // the refresh token -- retry once with a fresh access token before giving
    // up and treating the user as signed out. Never retry the refresh call
    // itself (it doesn't carry an access token, so a 401 there means the
    // refresh token is dead too).
    if (res.status === 401 && !isRetry && path !== '/auth/refresh' && (await refreshAccessToken())) {
      return request<T>(path, init, true);
    }
    // A 401 here means there's no usable session (expired refresh token,
    // revoked by /auth/logout elsewhere, or never signed in) -- drop it so the
    // next render treats the user as signed out instead of retrying forever.
    if (res.status === 401) clearSession();
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body?.error.code ?? 'unknown_error', body?.error.message ?? 'Something went wrong');
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function signup(email: string, password: string): Promise<{ message: string }> {
  return request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function apiLogout(): Promise<void> {
  return request('/auth/logout', { method: 'POST' });
}

export function fetchMe(): Promise<AuthUser> {
  return request('/auth/me');
}

export function fetchWaitlist(status = 'pending'): Promise<WaitlistEntriesResponse> {
  return request(`/admin/waitlist?status=${encodeURIComponent(status)}`);
}

export function approveWaitlistEntry(userId: string): Promise<{ userId: string; status: string }> {
  return request(`/admin/waitlist/${userId}/approve`, { method: 'POST' });
}

export function rejectWaitlistEntry(userId: string, reason?: string): Promise<{ userId: string; status: string }> {
  return request(`/admin/waitlist/${userId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
}
