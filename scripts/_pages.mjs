#!/usr/bin/env node
/**
 * scripts/_pages.mjs — canonical inventory of shipped HTML pages (RC-1).
 *
 * ROOT CAUSE CLOSED HERE (ROOT-CAUSE-REVIEW-2026-09-24 §2 RC-1): check-links,
 * check-no-storage and check-contrast each carried a copied GLOBS array that
 * assumed every page lives at `<dir>/<slug>/index.html`. The flat shapes —
 * `workflows/*.html`, `guides/*.html` — and `chaingraph/chains/*.html` +
 * `showcase/index.html` matched nothing, so 54 shipped pages were ungated
 * while deploy.yml's comments claimed full coverage (PRJ-001). No gate may
 * declare its own page globs anymore: import `listShippedPages()` from here.
 *
 * Canonical shapes (each line = one shipped directory shape):
 *   tools/<slug>/index.html          (185)
 *   showcase/<slug>/index.html       (111)
 *   showcase/index.html              (1)
 *   workflows/<name>.html            (41, flat)
 *   guides/<name>.html               (10, flat)
 *   chaingraph/*.html                (14: hub + personas)
 *   chaingraph/chains/*.html         (2)
 *   *.html                           (7 root pages)
 *   → 371 shipped pages at the time of writing.
 *
 * CLI:
 *   node scripts/_pages.mjs           → print the inventory (one path per line)
 *   node scripts/_pages.mjs --check   → diff the canonical shapes against a
 *     shape-agnostic walk of every *.html on disk (minus EXCLUDED_DIRS). A file
 *     the shapes don't account for, or a shape entry with no file behind it,
 *     exits 1. This is the tripwire that turns "someone added a new page shape"
 *     into a CI failure until the canonical list above is extended — instead of
 *     three copied glob arrays silently drifting again.
 */
import { readdirSync, existsSync, statSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Directories that are tooling, not shipped site pages. Everything else with
// *.html on disk must be accounted for by SHAPES.
const EXCLUDED_DIRS = new Set(['node_modules', 'scripts', '.github', 'assets', 'data']);

// Each entry: [directory (relative, '' = repo root), pattern]. `*` is the
// wildcard (matches ≥1 char); a pattern without `*` is a literal filename.
const SHAPES = [
  ['tools', '*/index.html'],
  ['showcase', '*/index.html'],
  ['showcase', 'index.html'],
  ['workflows', '*.html'],
  ['guides', '*.html'],
  ['chaingraph', '*.html'],
  ['chaingraph/chains', '*.html'],
  ['', '*.html'],
];

function expandShape(dir, pattern) {
  const slash = pattern.lastIndexOf('/');
  const head = slash === -1 ? '' : pattern.slice(0, slash + 1); // '*/' or ''
  const tail = slash === -1 ? pattern : pattern.slice(slash + 1); // literal tail after the wildcard dir, or the full flat pattern
  const baseAbs = join(ROOT, dir);
  let entries;
  try {
    entries = readdirSync(baseAbs);
  } catch {
    return [];
  }
  const out = [];
  if (head === '*/') {
    // Wildcard over subdirectories of `dir`; `tail` is a literal filename.
    for (const name of entries) {
      if (statSync(join(baseAbs, name)).isDirectory() && existsSync(join(baseAbs, name, tail))) {
        out.push(join(dir, name, tail));
      }
    }
  } else if (tail.includes('*')) {
    // Flat wildcard over files in `dir`.
    const at = tail.indexOf('*');
    const prefix = tail.slice(0, at);
    const suffix = tail.slice(at + 1);
    for (const name of entries) {
      if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue;
      if (name.length <= prefix.length + suffix.length) continue; // '*' matches ≥1 char
      if (statSync(join(baseAbs, name)).isFile()) out.push(join(dir, name));
    }
  } else {
    // Literal filename.
    const abs = join(baseAbs, tail);
    if (existsSync(abs) && statSync(abs).isFile()) out.push(join(dir, tail));
  }
  return out.sort();
}

export function listShippedPages() {
  const pages = [];
  for (const [dir, pattern] of SHAPES) pages.push(...expandShape(dir, pattern));
  return pages.map((p) => p.replace(/\\/g, '/'));
}

function walkAllHtml() {
  const found = [];
  function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (EXCLUDED_DIRS.has(e.name)) continue;
        walk(abs);
      } else if (e.name.endsWith('.html')) {
        found.push(relative(ROOT, abs).replace(/\\/g, '/'));
      }
    }
  }
  walk(ROOT);
  return found.sort();
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('_pages.mjs')) {
  const canonical = listShippedPages();
  if (process.argv.includes('--check')) {
    const onDisk = walkAllHtml();
    const canonSet = new Set(canonical);
    const diskSet = new Set(onDisk);
    const unaccounted = onDisk.filter((f) => !canonSet.has(f));
    const phantom = canonical.filter((f) => !diskSet.has(f));
    if (unaccounted.length || phantom.length) {
      console.error(`_pages: inventory mismatch — canonical ${canonical.length}, on disk ${onDisk.length}`);
      for (const f of unaccounted) console.error(`  UNACCOUNTED (extend SHAPES in scripts/_pages.mjs): ${f}`);
      for (const f of phantom) console.error(`  PHANTOM (shape entry, no file): ${f}`);
      process.exit(1);
    }
    console.log(`_pages: inventory agrees — ${canonical.length} shipped pages, shapes account for every *.html on disk.`);
    process.exit(0);
  }
  for (const p of canonical) console.log(p);
}
