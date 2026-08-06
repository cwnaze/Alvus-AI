#!/usr/bin/env node
/**
 * Bind every app-runtime variable to the Worker via `wrangler secret put`.
 *
 * .env.example is the contract: everything listed under its "App runtime"
 * heading is a Worker secret, everything above it (Cloudflare/Supabase
 * CI/deploy-time auth) is not and must never be bound. Reads values from
 * .env, which write-env.mjs already materialized from repo secrets.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

if (!fs.existsSync('.env.example') || !fs.existsSync('.env')) {
  console.log('No .env.example/.env — nothing to bind.');
  process.exit(0);
}

const exampleLines = fs.readFileSync('.env.example', 'utf8').split('\n');
let inRuntimeSection = false;
const runtimeKeys = [];
for (const line of exampleLines) {
  if (/App runtime/i.test(line)) inRuntimeSection = true;
  const key = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
  if (inRuntimeSection && key) runtimeKeys.push(key);
}

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split('\n')
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

let count = 0;
for (const key of runtimeKeys) {
  const value = env[key];
  if (!value) {
    console.log(`skip ${key} (no value)`);
    continue;
  }
  execFileSync('npx', ['wrangler', 'secret', 'put', key, '--env-file', '.env'], {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  count++;
}
console.log(`${count} Worker secret(s) bound.`);
