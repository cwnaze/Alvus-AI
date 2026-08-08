export const WAITLIST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const USER_ROLES = ['member', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// Mirrors the JSON wire contract in docs/api.md exactly (snake_case) so the
// frontend never has to translate between a domain shape and the response body.
export type AuthUser = {
  id: string;
  email: string;
  status: WaitlistStatus;
  role: UserRole;
  created_at: string;
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
};

export type WaitlistEntry = {
  id: string;
  user_id: string;
  email: string;
  status: WaitlistStatus;
  requested_at: string | null;
  reviewed_at: string | null;
};

export type WaitlistEntriesResponse = {
  entries: WaitlistEntry[];
  next_cursor: string | null;
};
