#!/usr/bin/env node
/**
 * scripts/check-links.mjs — internal dead-link gate (AL-LINKGATE).
 *
 * Extracts every href/src from every shipped HTML page and verifies the target
 * exists on disk. Page inventory comes from scripts/_pages.mjs (RC-1,
 * ROOT-CAUSE-REVIEW-2026-09-24): this gate previously carried its own GLOBS
 * array whose workflows and guides shapes expected a `<dir>/name/index.html`
 * layout while the pages ship flat as `<dir>/name.html`, leaving 54 shipped pages unscanned while deploy.yml claimed
 * full coverage. No gate may declare its own page globs anymore.
 *
 * Three documented traps (all hit by earlier manual audits) are handled
 * explicitly:
 *
 *  1. A leading `/` is the DOCUMENT ROOT (repo root here), not "relative to
 *     the linking file's directory." Resolving it the wrong way is exactly
 *     why two prior manual audit passes disagreed by 4 links (the 4
 *     root-absolute `/tools/NN-slug/` refs that are actually correct).
 *  2. A directory target `x/` maps to `x/index.html`, and the trailing
 *     slash is NEVER stripped before the existence test — normalizing it
 *     away first is what produced the audit's retracted P2-1 (180
 *     correctly-formed links misread as broken).
 *  3. Fragments are validated, not skipped (RC-1 follow-up, 2026-09-24):
 *     `href="#foo"` must match an `id="foo"`/`name="foo"` in the same page,
 *     `href="page#foo"` must match one in the target page, and a bare
 *     `href="#"` is a placeholder affordance that reloads the page — flagged.
 *     (This is what catches `#demos`-style anchors and the 8 `Full tool`
 *     placeholders on workflows/education-path-decision-engine.html.)
 *
 * Still skipped: absolute URLs (http/https/protocol-relative), mailto:, tel:,
 * `data:` URIs, and anything containing a `${` template literal (JS building a
 * URL at runtime, not a static link).
 *
 * Attribute matching avoids two false-positive classes the auditor also
 * documented: a bare `src=` matching JS variable assignments like
 * `saiSrc = ...` (guarded by a "not preceded by identifier char" lookbehind
 * requiring an actual `href=`/`src=` attribute), and HTML comments (stripped
 * before scanning, same as check-no-storage.mjs).
 *
 * Usage: node scripts/check-links.mjs
 * Exit 0 = clean. Exit 1 = one or more dead links (path:line + href printed).
 */
import { readFileSync, statSync, existsSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';
import { listShippedPages } from './_pages.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ''));
}

// Requires an actual href/src attribute — not a bare JS identifier like `saiSrc =`.
const ATTR_RE = /(?<![A-Za-z0-9_-])(?:href|src)\s*=\s*(["'])(.*?)\1/g;

function shouldSkip(href) {
  if (!href) return true;
  if (href.includes('${')) return true;
  if (/^(https?:)?\/\//i.test(href)) return true;
  if (/^(mailto|tel|data|javascript):/i.test(href)) return true;
  return false;
}

function resolveTarget(fileAbsPath, href) {
  // Strip fragment/query before resolving.
  const clean = href.split('#')[0].split('?')[0];
  if (clean === '') return null; // pure fragment

  let targetAbs;
  if (clean.startsWith('/')) {
    targetAbs = resolve(ROOT, '.' + clean);
  } else {
    targetAbs = resolve(dirname(fileAbsPath), clean);
  }
  return targetAbs;
}

function targetExists(targetAbs, originalHref) {
  const isDirRef = originalHref.split('#')[0].split('?')[0].endsWith('/');
  if (isDirRef) {
    return existsSync(join(targetAbs, 'index.html'));
  }
  if (existsSync(targetAbs)) {
    if (statSync(targetAbs).isDirectory()) {
      return existsSync(join(targetAbs, 'index.html'));
    }
    return true;
  }
  return false;
}

// id=/name= targets per file, cached. Null = target has no checkable id set
// (missing file or non-HTML) — fragment checks pass vacuously there.
const idCache = new Map();
function idSetOf(absPath) {
  if (idCache.has(absPath)) return idCache.get(absPath);
  let ids = null;
  try {
    if (absPath.toLowerCase().endsWith('.html') && existsSync(absPath) && statSync(absPath).isFile()) {
      const text = stripComments(readFileSync(absPath, 'utf8'));
      ids = new Set([...text.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/g)].map(m => m[1]));
    }
  } catch {
    ids = null;
  }
  idCache.set(absPath, ids);
  return ids;
}

function scanFile(absPath) {
  const rel = relative(ROOT, absPath).replace(/\\/g, '/');
  const raw = readFileSync(absPath, 'utf8');
  const text = stripComments(raw);
  const lines = text.split('\n');
  const ids = new Set([...text.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/g)].map(m => m[1]));
  const dead = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(line)) !== null) {
      const href = m[2];
      if (shouldSkip(href)) continue;

      // Fragment-only refs resolve against this page.
      if (href.startsWith('#')) {
        const frag = href.slice(1);
        if (frag === '') {
          dead.push({ file: rel, line: i + 1, href, why: 'placeholder href="#" — reloads the same page' });
        } else if (!ids.has(frag)) {
          dead.push({ file: rel, line: i + 1, href, why: `fragment #${frag} has no id=/name= in this page` });
        }
        continue;
      }

      const targetAbs = resolveTarget(absPath, href);
      if (targetAbs === null) continue;
      if (!targetExists(targetAbs, href)) {
        dead.push({ file: rel, line: i + 1, href, why: 'target does not exist' });
        continue;
      }
      // Cross-page fragment: validate against the target's ids where checkable.
      const hashAt = href.indexOf('#');
      if (hashAt !== -1) {
        const frag = href.slice(hashAt + 1).split('?')[0];
        if (frag !== '') {
          let idFile = targetAbs;
          if (statSync(idFile).isDirectory() || href.split('#')[0].endsWith('/')) idFile = join(idFile, 'index.html');
          const targetIds = idSetOf(idFile);
          if (targetIds && !targetIds.has(frag)) {
            dead.push({ file: rel, line: i + 1, href, why: `fragment #${frag} has no id=/name= in target page` });
          }
        }
      }
    }
  }

  return dead;
}

let allDead = [];
for (const rel of listShippedPages()) {
  allDead.push(...scanFile(resolve(ROOT, rel)));
}

if (allDead.length === 0) {
  console.log(`check-links: clean — 0 dead links across ${listShippedPages().length} pages (paths + fragments).`);
  process.exit(0);
} else {
  console.log(`check-links: ${allDead.length} dead link(s):\n`);
  for (const d of allDead) {
    console.log(`  ${d.file}:${d.line}  ${d.href}  — ${d.why}`);
  }
  console.log('\nFix the target or the href — no baseline, no exception list.');
  process.exit(1);
}
