#!/usr/bin/env node
/**
 * scripts/gen-sitemap.mjs — derive sitemap.xml <lastmod> from git history (AL-SITEMAP-LASTMOD).
 *
 * sitemap.xml's <loc> set is trusted as-is (all 352 URLs resolve, per the audit
 * that opened this WU) — this script only rewrites <lastmod>, computed from
 * `git log -1 --format=%cd --date=short -- <path>` for the file each URL maps to.
 * <changefreq>/<priority> are left untouched.
 *
 * Requires full git history (fetch-depth: 0) — on a shallow clone, `git log`
 * silently returns the shallow-boundary commit's date for every file, which
 * is wrong and worse than the hand-typed dates it replaces.
 *
 * Modes:
 *   node scripts/gen-sitemap.mjs          # --check (CI default): exit 1 on drift
 *   node scripts/gen-sitemap.mjs --fix    # rewrite sitemap.xml in place
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FIX = process.argv.includes('--fix');

// Verify this is not a shallow clone — a shallow `git log` would silently
// produce wrong dates rather than erroring, so check explicitly.
const shallow = existsSync(resolve(ROOT, '.git/shallow'));
if (shallow) {
  console.error('FATAL  .git/shallow present — this checkout has no full history.');
  console.error('       gen-sitemap.mjs needs `fetch-depth: 0` (or `git fetch --unshallow`) to compute correct lastmod dates.');
  process.exit(1);
}

function locToPath(loc) {
  const u = new URL(loc);
  let p = decodeURIComponent(u.pathname); // e.g. "/", "/about.html", "/tools/foo/", "/workflows/bar.html"
  if (p === '/') return 'index.html';
  if (p.endsWith('/')) return p.slice(1) + 'index.html'; // dir URL -> its index.html
  return p.slice(1); // file URL, e.g. "about.html", "workflows/bar.html"
}

function gitLastmod(relPath) {
  const full = resolve(ROOT, relPath);
  if (!existsSync(full)) {
    console.warn(`WARN   no local file for ${relPath} — leaving lastmod unchanged`);
    return null;
  }
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cd', '--date=short', '--', relPath], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    return out || null; // empty = file exists but never committed (e.g. untracked) -> leave unchanged
  } catch {
    return null;
  }
}

const xml = readFileSync(resolve(ROOT, 'sitemap.xml'), 'utf8');

const URL_BLOCK_RE = /<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g;

let drift = 0;
let total = 0;
const out = xml.replace(URL_BLOCK_RE, (block, loc, oldLastmod) => {
  total++;
  const relPath = locToPath(loc);
  const newLastmod = gitLastmod(relPath);
  if (newLastmod === null) return block; // no signal — don't touch
  if (newLastmod !== oldLastmod) {
    drift++;
    console.log(`DRIFT  ${loc}  ${oldLastmod} -> ${newLastmod}`);
    return block.replace(`<lastmod>${oldLastmod}</lastmod>`, `<lastmod>${newLastmod}</lastmod>`);
  }
  return block;
});

console.log(`\n${total} URLs checked, ${drift} drifted.`);

if (drift === 0) {
  console.log('sitemap.xml lastmod values match git history.');
  process.exit(0);
} else if (FIX) {
  writeFileSync(resolve(ROOT, 'sitemap.xml'), out, 'utf8');
  console.log(`WROTE  sitemap.xml (${drift} lastmod value(s) updated)`);
  process.exit(0);
} else {
  console.log('Run with --fix to repair.');
  process.exit(1);
}
