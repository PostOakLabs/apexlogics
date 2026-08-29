#!/usr/bin/env node
/**
 * scripts/check-links.mjs — internal dead-link gate (AL-LINKGATE).
 *
 * Extracts every href/src from every HTML page in the repo and verifies the
 * target exists on disk. Two documented traps (both hit by the original
 * manual audit, `hy4-workbuddy-audit.md`) are handled explicitly:
 *
 *  1. A leading `/` is the DOCUMENT ROOT (repo root here), not "relative to
 *     the linking file's directory." Resolving it the wrong way is exactly
 *     why two prior manual audit passes disagreed by 4 links (the 4
 *     root-absolute `/tools/NN-slug/` refs that are actually correct).
 *  2. A directory target `x/` maps to `x/index.html`, and the trailing
 *     slash is NEVER stripped before the existence test — normalizing it
 *     away first is what produced the audit's retracted P2-1 (180
 *     correctly-formed links misread as broken).
 *
 * Also skips: absolute URLs (http/https/protocol-relative), mailto:, tel:,
 * bare `#` fragments, `data:` URIs, and anything containing a `${` template
 * literal (JS building a URL at runtime, not a static link).
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
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, dirname, relative, join, posix } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const GLOBS = [
  'tools/*/index.html',
  'showcase/*/index.html',
  'chaingraph/*.html',
  'workflows/*/index.html',
  'guides/*/index.html',
  '*.html',
];

function expandGlob(pattern) {
  const [dirPart, filePart] = pattern.includes('/')
    ? [pattern.slice(0, pattern.lastIndexOf('/')), pattern.slice(pattern.lastIndexOf('/') + 1)]
    : ['', pattern];

  if (dirPart.includes('*')) {
    const baseDir = dirPart.slice(0, dirPart.indexOf('*'));
    const baseAbs = resolve(ROOT, baseDir);
    let entries;
    try {
      entries = readdirSync(baseAbs);
    } catch {
      return [];
    }
    return entries
      .filter(name => statSync(join(baseAbs, name)).isDirectory())
      .map(name => join(baseDir, name, filePart))
      .filter(p => {
        try {
          return statSync(resolve(ROOT, p)).isFile();
        } catch {
          return false;
        }
      });
  }

  const baseAbs = resolve(ROOT, dirPart || '.');
  let entries;
  try {
    entries = readdirSync(baseAbs);
  } catch {
    return [];
  }
  const suffix = filePart.replace('*', '');
  return entries
    .filter(name => name.endsWith(suffix) && name !== suffix)
    .filter(name => statSync(join(baseAbs, name)).isFile())
    .map(name => join(dirPart, name));
}

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
  if (href.startsWith('#')) return true;
  return false;
}

function resolveTarget(fileAbsPath, href) {
  // Strip fragment/query before resolving.
  const clean = href.split('#')[0].split('?')[0];
  if (clean === '') return null; // pure fragment, already skipped above but defensive

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

function scanFile(absPath) {
  const rel = relative(ROOT, absPath).replace(/\\/g, '/');
  const raw = readFileSync(absPath, 'utf8');
  const text = stripComments(raw);
  const lines = text.split('\n');
  const dead = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(line)) !== null) {
      const href = m[2];
      if (shouldSkip(href)) continue;
      const targetAbs = resolveTarget(absPath, href);
      if (targetAbs === null) continue;
      if (!targetExists(targetAbs, href)) {
        dead.push({ file: rel, line: i + 1, href });
      }
    }
  }

  return dead;
}

let allDead = [];
for (const pattern of GLOBS) {
  const files = expandGlob(pattern);
  for (const f of files) {
    allDead.push(...scanFile(resolve(ROOT, f)));
  }
}

if (allDead.length === 0) {
  console.log('check-links: clean — 0 dead internal links.');
  process.exit(0);
} else {
  console.log(`check-links: ${allDead.length} dead link(s):\n`);
  for (const d of allDead) {
    console.log(`  ${d.file}:${d.line}  ${d.href}`);
  }
  console.log('\nFix the target or the href — no baseline, no exception list.');
  process.exit(1);
}
