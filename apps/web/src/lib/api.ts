import type { AuthUser, LoginResponse, WaitlistEntriesResponse } from '@alvus-ai/shared';
import { clearSession, getAccessToken } from './session';

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...init, headers });

  if (!res.ok) {
    // A 401 means our stored token is dead (expired, or the session was
    // revoked by /auth/logout elsewhere) -- drop it so the next render treats
    // the user as signed out instead of retrying with the same bad token.
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
