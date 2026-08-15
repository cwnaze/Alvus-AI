import type {
  AdminUsersResponse,
  AuthUser,
  BibliographyResponse,
  BillingStatusResponse,
  CheckoutSessionResponse,
  CitationFormat,
  DocumentContent,
  DocumentFormatResponse,
  FeedbackPassResponse,
  FeedbackPassesResponse,
  LoginResponse,
  PaidTier,
  PortalSessionResponse,
  Project,
  ProjectDocumentResponse,
  ProjectSource,
  ProjectSourcesResponse,
  ProjectsResponse,
  RefreshResponse,
  SaveDocumentResponse,
  SharedPaperResponse,
  ShareLinkResponse,
  SourceAnalysis,
  SourceSearchResponse,
  SourceStateResponse,
  SuggestionsResponse,
  WaitlistEntriesResponse,
} from '@alvus-ai/shared';
import { clearSession, getAccessToken, getRefreshToken, setTokens } from './session';

type ApiErrorBody = { error: { code: string; message: string; correlationId: string; meta?: Record<string, unknown> } };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public meta?: Record<string, unknown>,
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
  // A FormData body (source upload) must keep the browser-generated
  // multipart boundary in its own Content-Type -- setting it here would
  // overwrite that boundary and break parsing server-side.
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
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
    throw new ApiError(res.status, body?.error.code ?? 'unknown_error', body?.error.message ?? 'Something went wrong', body?.error.meta);
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

export function requestPasswordReset(email: string): Promise<void> {
  return request('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) });
}

export function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  return request('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, new_password: newPassword }),
  });
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

export function fetchAdminUsers(params: { q?: string; status?: string; tier?: string } = {}): Promise<AdminUsersResponse> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status) query.set('status', params.status);
  if (params.tier) query.set('tier', params.tier);
  const qs = query.toString();
  return request(`/admin/users${qs ? `?${qs}` : ''}`);
}

export function revokeUserAccess(userId: string, reason?: string): Promise<{ userId: string; status: string }> {
  return request(`/admin/users/${userId}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function fetchBillingStatus(sessionId?: string | null): Promise<BillingStatusResponse> {
  return request(`/billing/status${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''}`);
}

export function createCheckoutSession(tier: PaidTier): Promise<CheckoutSessionResponse> {
  return request('/billing/checkout-session', { method: 'POST', body: JSON.stringify({ tier }) });
}

export function createPortalSession(): Promise<PortalSessionResponse> {
  return request('/billing/portal-session', { method: 'POST', body: JSON.stringify({}) });
}

export function fetchProjects(cursor?: string | null): Promise<ProjectsResponse> {
  return request(`/projects${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
}

export function createProject(title: string, citationFormat: CitationFormat): Promise<Project> {
  return request('/projects', { method: 'POST', body: JSON.stringify({ title, citation_format: citationFormat }) });
}

export function renameProject(projectId: string, title: string): Promise<Project> {
  return request(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify({ title }) });
}

export function deleteProject(projectId: string): Promise<void> {
  return request(`/projects/${projectId}`, { method: 'DELETE' });
}

export function fetchProject(projectId: string): Promise<Project> {
  return request(`/projects/${projectId}`);
}

export function searchSources(
  projectId: string,
  params: { query?: string; openAccessOnly?: boolean } = {},
): Promise<SourceSearchResponse> {
  return request(`/projects/${projectId}/sources/search`, {
    method: 'POST',
    body: JSON.stringify({ query: params.query, open_access_only: params.openAccessOnly }),
  });
}

export function fetchSources(projectId: string, status?: 'candidate' | 'selected'): Promise<ProjectSourcesResponse> {
  return request(`/projects/${projectId}/sources${status ? `?status=${status}` : ''}`);
}

export function uploadSource(projectId: string, file: File, title?: string): Promise<ProjectSource> {
  const form = new FormData();
  form.set('file', file);
  if (title) form.set('title', title);
  return request(`/projects/${projectId}/sources/upload`, { method: 'POST', body: form });
}

export function analyzeSource(projectId: string, sourceId: string, forceRefresh = false): Promise<SourceAnalysis> {
  return request(`/projects/${projectId}/sources/${sourceId}/analyze`, {
    method: 'POST',
    body: JSON.stringify({ force_refresh: forceRefresh }),
  });
}

export function selectSource(projectId: string, sourceId: string): Promise<SourceStateResponse> {
  return request(`/projects/${projectId}/sources/${sourceId}/select`, { method: 'POST' });
}

export function deselectSource(projectId: string, sourceId: string): Promise<SourceStateResponse> {
  return request(`/projects/${projectId}/sources/${sourceId}/deselect`, { method: 'POST' });
}

export function rejectSource(projectId: string, sourceId: string): Promise<SourceStateResponse> {
  return request(`/projects/${projectId}/sources/${sourceId}/reject`, { method: 'POST' });
}

export function fetchBibliography(projectId: string): Promise<BibliographyResponse> {
  return request(`/projects/${projectId}/bibliography`);
}

export function fetchDocument(projectId: string): Promise<ProjectDocumentResponse> {
  return request(`/projects/${projectId}/document`);
}

export function saveDocument(projectId: string, content: DocumentContent): Promise<SaveDocumentResponse> {
  return request(`/projects/${projectId}/document`, { method: 'PUT', body: JSON.stringify({ content }) });
}

export function formatDocument(projectId: string): Promise<DocumentFormatResponse> {
  return request(`/projects/${projectId}/document/format`, { method: 'POST', body: JSON.stringify({}) });
}

export function fetchSuggestions(projectId: string, cursorContext: string): Promise<SuggestionsResponse> {
  return request(`/projects/${projectId}/document/suggestions`, {
    method: 'POST',
    body: JSON.stringify({ cursor_context: cursorContext }),
  });
}

export function requestFeedbackPass(projectId: string): Promise<FeedbackPassResponse> {
  return request(`/projects/${projectId}/document/feedback`, { method: 'POST', body: JSON.stringify({}) });
}

export function fetchFeedbackPasses(projectId: string, cursor?: string | null): Promise<FeedbackPassesResponse> {
  return request(`/projects/${projectId}/document/feedback${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
}

export function fetchFeedbackPass(projectId: string, passId: string): Promise<FeedbackPassResponse> {
  return request(`/projects/${projectId}/document/feedback/${passId}`);
}

export function createShareLink(projectId: string): Promise<ShareLinkResponse> {
  return request(`/projects/${projectId}/share-link`, { method: 'POST', body: JSON.stringify({}) });
}

export function fetchShareLink(projectId: string): Promise<ShareLinkResponse> {
  return request(`/projects/${projectId}/share-link`);
}

export function revokeShareLink(projectId: string): Promise<void> {
  return request(`/projects/${projectId}/share-link`, { method: 'DELETE' });
}

export function fetchSharedPaper(token: string): Promise<SharedPaperResponse> {
  return request(`/shared/${token}`);
}
