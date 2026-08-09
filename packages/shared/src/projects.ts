import type { CitationFormat } from './citation';

export const PROJECT_STATUSES = ['draft', 'in_progress', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// Mirrors the JSON wire contract in docs/api.md exactly (snake_case).
export type Project = {
  id: string;
  owner_id: string;
  title: string;
  citation_format: CitationFormat;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
};

export type ProjectsResponse = {
  projects: Project[];
  next_cursor: string | null;
};
