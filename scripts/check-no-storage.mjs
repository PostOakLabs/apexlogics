#!/usr/bin/env node
/**
 * scripts/check-no-storage.mjs — Zero-PII / zero-client-storage gate (AL-I18N-RECORD, CG-35).
 *
 * CONTRACT §0 Client Storage is the suite's hardest constraint (zero PII, zero client
 * storage beyond the single permitted `apex_persona` sessionStorage key) and, until now,
 * no gate asserted it — `check_tools.js` gates JS syntax, `verify-counts.mjs` gates count
 * drift, but a tool could write `localStorage`/live `sessionStorage`/cookies/IndexedDB
 * and nothing would catch it. That's exactly what happened: 85 tools carried a live
 * `apex_lang` sessionStorage write for roughly a year before `AL-I18N-NEUTRALIZE` (PR #36)
 * killed it. This gate exists so that can't happen silently again.
 *
 * Scans every real `<script>` line (HTML comments and JS `//` / block comments are
 * excluded — an inert code comment mentioning "no sessionStorage" is not a violation)
 * for `localStorage`, `sessionStorage`, `document.cookie`, or `indexedDB`.
 *
 * Zero allowed. No baseline file, no exception list — CG-26 emptied the storage
 * whitelist down to a single sessionStorage key (`apex_persona`) and that key is
 * PERMITTED_CALLS below, not exempted from scanning; a baseline would just let drift
 * creep back in under cover of "already known." Any hit fails the gate.
 *
 * Usage: node scripts/check-no-storage.mjs
 * Exit 0 = clean. Exit 1 = one or more violations (path:line + matched API printed).
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// fs.globSync is Node 22+; CI pins Node 20 (see .github/workflows/deploy.yml), so these
// simple one-level patterns are matched by hand instead of relying on that API.
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
    // 'tools/*/index.html' — dirPart is 'tools/*', enumerate subdirectories
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

  // 'chaingraph/*.html' or '*.html' — dirPart has no wildcard, filePart is '*.html'
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

// Requires property/bracket/call access, not a bare word — "no sessionStorage" in a privacy
// disclosure sentence, or `storage:"sessionStorage:ain_lang only"` in a manifest string, must
// NOT trip this; `sessionStorage.setItem(...)` and `sessionStorage['x']` must. Confirmed
// against the sister suite (AINumbers.co) during Part D of this WU: a bare-word version of
// this regex produced 21 false positives there, all prose or manifest string literals, zero
// real API calls.
const API_RE = /\b(localStorage|sessionStorage)\s*[.\[]|document\s*\.\s*cookie\b|\bindexedDB\s*[.\[]/;

// The one call CONTRACT §0 still permits: sessionStorage.setItem/getItem('apex_persona', ...).
// Recorded here for operator context only — NOT an exception. It still matches API_RE and
// still fails the gate. Per AL-I18N-RECORD-SPEC.md: "zero means zero," no baseline, no
// exception list. If this ever needs to be genuinely allowed, that's a CONTRACT amendment
// (new CG number) that edits this script explicitly — not a silent carve-out.
const _APEX_PERSONA_NOTE =
  'apex_persona sessionStorage (persona-highlight persistence, CONTRACT §0/§1.5) is NOT exempted here.';

function isCodeLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('//')) return false;
  if (trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  if (trimmed.startsWith('<!--')) return false;
  return true;
}

function stripInlineComment(line) {
  // Best-effort: drop a trailing `// ...` that isn't inside a string. Good enough for this
  // codebase's style (no `//` appears inside the string literals these tools emit).
  const idx = line.indexOf('//');
  if (idx === -1) return line;
  return line.slice(0, idx);
}

function scanFile(absPath) {
  const rel = relative(ROOT, absPath).replace(/\\/g, '/');
  const text = readFileSync(absPath, 'utf8');
  const lines = text.split('\n');
  const hits = [];
  let inBlockComment = false;
  let inHtmlComment = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (inHtmlComment) {
      if (line.includes('-->')) inHtmlComment = false;
      continue;
    }
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }

    const htmlCommentStart = line.indexOf('<!--');
    if (htmlCommentStart !== -1 && !line.includes('-->', htmlCommentStart)) {
      line = line.slice(0, htmlCommentStart);
      inHtmlComment = true;
    } else if (htmlCommentStart !== -1) {
      line = line.slice(0, htmlCommentStart) + line.slice(line.indexOf('-->', htmlCommentStart) + 3);
    }

    const blockStart = line.indexOf('/*');
    if (blockStart !== -1 && !line.includes('*/', blockStart)) {
      line = line.slice(0, blockStart);
      inBlockComment = true;
    } else if (blockStart !== -1) {
      line = line.slice(0, blockStart) + line.slice(line.indexOf('*/', blockStart) + 2);
    }

    if (!isCodeLine(line)) continue;
    line = stripInlineComment(line);

    const m = line.match(API_RE);
    if (m) hits.push({ line: i + 1, api: m[0].trim().replace(/\s*\.\s*/g, '.').replace(/[.\[]$/, ''), text: line.trim().slice(0, 140) });
  }

  return hits.map(h => ({ file: rel, ...h }));
}

let allHits = [];
for (const pattern of GLOBS) {
  const files = expandGlob(pattern);
  for (const f of files) {
    allHits.push(...scanFile(resolve(ROOT, f)));
  }
}

if (allHits.length === 0) {
  console.log('check-no-storage: clean — 0 localStorage/sessionStorage/document.cookie/indexedDB hits.');
  process.exit(0);
} else {
  console.log(`check-no-storage: ${allHits.length} violation(s):\n`);
  for (const h of allHits) {
    console.log(`  ${h.file}:${h.line}  [${h.api}]  ${h.text}`);
  }
  console.log('\nZero tolerance — no baseline, no exception list (CONTRACT §0, CG-35). Remove the call.');
  process.exit(1);
}
