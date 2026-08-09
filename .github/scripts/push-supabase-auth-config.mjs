#!/usr/bin/env node
/**
 * Push site_url/uri_allow_list to the deployed Supabase project's Auth config.
 *
 * supabase/config.toml only ever applies to local `supabase start` stacks, and
 * `supabase config push` (the CLI's own remote-push command) isn't usable here:
 * it pushes the whole [auth] section as one diff, including the recovery email
 * template, and the shared project is on the free tier with no custom SMTP --
 * Supabase's Management API rejects ANY email-template change in that state
 * with a 400, which fails the entire push, template-unrelated fields included.
 *
 * PATCHing just the two fields this app actually needs sidesteps that: verified
 * directly against the project that a partial PATCH updates site_url/
 * uri_allow_list without touching (or being blocked by) the email template.
 */
import fs from 'node:fs';

if (!fs.existsSync('.env')) {
  console.log('No .env — nothing to push.');
  process.exit(0);
}

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split('\n')
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const { SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, PUBLIC_APP_URL } = env;
if (!SUPABASE_ACCESS_TOKEN || !SUPABASE_PROJECT_REF || !PUBLIC_APP_URL) {
  console.log('Missing SUPABASE_ACCESS_TOKEN/SUPABASE_PROJECT_REF/PUBLIC_APP_URL — nothing to push.');
  process.exit(0);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    site_url: PUBLIC_APP_URL,
    // A wildcard pattern, not a bare host: the redirectTo the app actually
    // sends is PUBLIC_APP_URL + /reset-password (see routes/auth.ts), and
    // GoTrue's allow-list match is exact-or-wildcard, not prefix -- a bare
    // host entry does not match its own subpaths.
    uri_allow_list: `${PUBLIC_APP_URL}/**`,
  }),
});

if (!res.ok) {
  console.error(`Failed to push Supabase auth config: ${res.status} ${await res.text()}`);
  process.exit(1);
}

console.log(`Pushed site_url/uri_allow_list to Supabase project ${SUPABASE_PROJECT_REF}.`);
