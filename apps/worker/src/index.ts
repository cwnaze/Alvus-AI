import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { createDb } from './lib/db/client';
import type { AuthVariables } from './middleware/auth';
import { CORRELATION_ID_HEADER, onError, type ErrorVariables } from './middleware/errors';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import editorRoutes from './routes/editor';
import feedbackRoutes from './routes/feedback';
import projectsRoutes from './routes/projects';
import sourcesRoutes from './routes/sources';

type Bindings = {
  DATABASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  PUBLIC_APP_URL: string;
  SOURCES_PROVIDER_MODE?: string;
  SEMANTIC_SCHOLAR_API_KEY?: string;
  CROSSREF_CONTACT_EMAIL?: string;
  UNPAYWALL_CONTACT_EMAIL?: string;
  AI_PROVIDER_MODE?: string;
  LITELLM_BASE_URL?: string;
  LITELLM_API_KEY?: string;
  LITELLM_MODEL?: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: ErrorVariables & AuthVariables }>();

app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
app.onError(onError);

app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/projects', projectsRoutes);
app.route('/api/projects/:projectId/sources', sourcesRoutes);
app.route('/api/projects/:projectId/document', editorRoutes);
app.route('/api/projects/:projectId/document/feedback', feedbackRoutes);

app.get('/api/health', async (c) => {
  // Deliberately not closed: one connection per request against Supabase's
  // pooler (see lib/db/client.ts), torn down by the runtime when the request's
  // execution context ends. Closing it here races the Workers postgres.js
  // polyfill's background stream read and surfaces as an unhandled rejection.
  const db = createDb(c.env.DATABASE_URL);
  try {
    await db.execute(sql`select 1`);
    return c.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    console.error('/api/health DB round-trip failed:', err);
    return c.json({ status: 'error', db: 'error' }, 503);
  }
});

export default app;
