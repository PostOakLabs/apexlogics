#!/usr/bin/env node
/**
 * scripts/check-seo-meta.mjs — SEO metadata gate (AL-META-SEO, CG-39).
 *
 * Blocking gate: every HTML page in the repo must carry a <title>,
 * <meta name="description">, <link rel="canonical">, the full OG set
 * (og:type, og:site_name, og:title, og:description, og:url, og:image),
 * and <meta name="twitter:card">. Prevents the P1-1/P1-2/P1-3 regression
 * this WU fixed (343/352 pages with no OG tags, 113 missing description,
 * 91 missing/inconsistent canonical) from silently creeping back in on
 * newly built pages.
 *
 * `assets/logo_candidates.html` is a non-shipped scratch page, excluded.
 *
 * Usage: node scripts/check-seo-meta.mjs   (exit 0 = clean, exit 1 = violations)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXCLUDE = new Set(['assets/logo_candidates.html']);

const REQUIRED = [
  ['<title>', /<title>[\s\S]*?<\/title>/i],
  ['meta description', /name=["']description["']/i],
  ['canonical link', /rel=["']canonical["']/i],
  ['og:type', /property=["']og:type["']/i],
  ['og:site_name', /property=["']og:site_name["']/i],
  ['og:title', /property=["']og:title["']/i],
  ['og:description', /property=["']og:description["']/i],
  ['og:url', /property=["']og:url["']/i],
  ['og:image', /property=["']og:image["']/i],
  ['twitter:card', /name=["']twitter:card["']/i],
];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = walk(ROOT, [])
  .map((p) => path.relative(ROOT, p).split(path.sep).join('/'))
  .filter((rel) => !EXCLUDE.has(rel));

let violations = 0;
for (const rel of files) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const missing = REQUIRED.filter(([, re]) => !re.test(html)).map(([name]) => name);
  if (missing.length) {
    violations++;
    console.log(`${rel}: missing ${missing.join(', ')}`);
  }
}

console.log(`\nChecked ${files.length} pages, ${violations} with missing SEO metadata.`);
if (violations > 0) process.exit(1);
