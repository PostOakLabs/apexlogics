#!/usr/bin/env node
/**
 * scripts/gen-sitemap.mjs — derive sitemap.xml <lastmod> from git history (AL-SITEMAP-LASTMOD).
 *
 * <lastmod> is rewritten, computed from `git log -1 --format=%cd --date=short
 * -- <path>` for the file each URL maps to. <changefreq>/<priority> are left
 * untouched. The <loc> set itself is ALSO checked (AL-GATE-HONESTY): any
 * <loc> mapping to a file absent from disk fails the build — a dead sitemap
 * URL had no gate covering it (check-links.mjs walks HTML hrefs, not sitemap
 * XML). All 352 URLs resolved at the time this check was added.
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

// AL-GATE-HONESTY: a <loc> mapping to a file absent from disk (deleted or
// renamed page, sitemap entry never cleaned up) used to just fall through
// gitLastmod's "no signal, don't touch" branch — the lastmod stayed
// untouched AND nothing else in this repo checks sitemap <loc> reachability
// (check-links.mjs walks HTML hrefs, not sitemap XML), so a dead sitemap URL
// could ship indefinitely under a green gate. A full disk diff at the time
// this was fixed found 0 dead <loc> entries in the live sitemap, so failing
// on this from here on costs nothing today and closes a real blind spot.
const deadLocs = [];

function gitLastmod(relPath, loc) {
  const full = resolve(ROOT, relPath);
  if (!existsSync(full)) {
    console.warn(`DEAD   ${loc}  ->  ${relPath} (no file on disk)`);
    deadLocs.push({ loc, relPath });
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
  const newLastmod = gitLastmod(relPath, loc);
  if (newLastmod === null) return block; // no signal — don't touch
  if (newLastmod !== oldLastmod) {
    drift++;
    console.log(`DRIFT  ${loc}  ${oldLastmod} -> ${newLastmod}`);
    return block.replace(`<lastmod>${oldLastmod}</lastmod>`, `<lastmod>${newLastmod}</lastmod>`);
  }
  return block;
});

console.log(`\n${total} URLs checked, ${drift} drifted, ${deadLocs.length} dead.`);

if (deadLocs.length) {
  console.error(`\nFAIL   ${deadLocs.length} sitemap <loc> entr${deadLocs.length === 1 ? 'y maps' : 'ies map'} to no file on disk:`);
  for (const { loc, relPath } of deadLocs) console.error(`  - ${loc}  (expected ${relPath})`);
  console.error('\nRemove the stale <url> block from sitemap.xml, or restore/redirect the page (see AL-REDIRECTS).');
  process.exit(1);
}

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
