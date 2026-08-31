#!/usr/bin/env node
/**
 * Every variable in .env.example must be documented in docs/infra.md's
 * Environment variables tables. Run this whenever either file changes --
 * a var with no purpose note there is undocumented, no matter how
 * self-explanatory its name looks.
 */
import fs from 'node:fs';

const envExample = fs.readFileSync('.env.example', 'utf8');
const infraDoc = fs.readFileSync('docs/infra.md', 'utf8');

const keys = [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
if (!keys.length) {
  console.error('.env.example: no KEY= lines found -- check the regex or the file');
  process.exit(1);
}

const missing = keys.filter((key) => !infraDoc.includes(`\`${key}\``));

console.log(`${keys.length} variables in .env.example, ${keys.length - missing.length} documented in docs/infra.md`);
if (missing.length) {
  console.error(`Missing from docs/infra.md: ${missing.join(', ')}`);
  process.exit(1);
}
