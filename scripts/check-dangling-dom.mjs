#!/usr/bin/env node
/**
 * scripts/check-dangling-dom.mjs — dangling getElementById gate (AL-DANGLING-DOM).
 *
 * Every page in this suite is a single `.html` file with no `<script src>` — the
 * reference and the element it targets always live in the same document. That makes
 * a `getElementById('X')` call whose `'X'` never appears anywhere as `id="X"` in that
 * same file a *statically detectable* defect, exactly like `check-ap2-validate.mjs`'s
 * `AP2Schema.<member>` check.
 *
 * Origin: AL-AP2-UNVALIDATED found tool 03 throwing `TypeError: Cannot set properties
 * of null` on `#mcpJson` at page load. ORCH re-measured (2026-08-30, `97f3aef8`) and
 * found 146 dangling references across 43 files, 23 of them unguarded chained
 * dereferences (`getElementById('X').prop`) across 16 files — every one of those
 * throws the instant its enclosing function runs. The dominant cause is CG-24
 * residue: the 2026-06-11 `mfst` standardization replaced `.mcp-toggle`/`.mcp-panel`/
 * `toggleMCP()` markup across 145 tools but left init code still reaching for the
 * retired ids (`mcpJson`, `mcpPanel`, `manifestPre`, etc).
 *
 * This gate flags two severities:
 *
 *   D1 UNGUARDED-CHAIN (BLOCKING)   `getElementById('X').prop` / `.method(...)` with
 *                                   no declared or dynamically-generated `id="X"`
 *                                   anywhere in the file, and no guard immediately
 *                                   preceding the call (see GUARDED below). This is
 *                                   the class that throws unconditionally the moment
 *                                   its enclosing function runs — a page-load throw
 *                                   (inside a `DOMContentLoaded` handler) silently
 *                                   aborts everything registered after it in that
 *                                   handler; a click-handler throw silently aborts
 *                                   the rest of that handler on every invocation.
 *
 *   D2 DANGLING-REFERENCE (WARN, non-blocking)   Every other `getElementById('X')`
 *                                   where `'X'` doesn't resolve — a non-chained
 *                                   reference (assigned to a variable, tested with
 *                                   `if (el)`, etc.) or one immediately guarded by a
 *                                   repeated ternary check (`getElementById('X') ?
 *                                   getElementById('X').prop : ...`). The 2026-08-30
 *                                   audit found this bucket is mostly harmless (null
 *                                   assigned but never dereferenced, or inside a
 *                                   function nothing calls) — printed for visibility,
 *                                   not build-breaking. A D2 finding graduates to D1
 *                                   the moment someone chains a dereference onto it
 *                                   without a guard, or removes the guard that
 *                                   currently protects it — re-run this gate after
 *                                   editing any function in the printed list.
 *
 * "Resolves" means either:
 *   (a) a literal `id="X"` attribute appears anywhere in the file, or
 *   (b) `'X'` matches an in-file DYNAMIC ID TEMPLATE — an `id="...${...}..."`
 *       attribute written inside a JS template literal and rendered into the DOM at
 *       runtime (e.g. `id="p${n}Name"` renders `p1Name`/`p2Name`; `id="optText${i}"`
 *       renders `optText0..3`). Two of the original 23 unguarded findings (tool 03's
 *       `p1Name`/`p1Tuition`/`p1Years`/`p1PostSalary`/`p1Field`, tool 68's `optText0`)
 *       turned out to be exactly this — real ids that exist in the live DOM by the
 *       time the flagged call runs, invisible to a scan that only looks for literal
 *       `id="X"` attributes. Confirmed by reading each file's render function before
 *       ruling it a false positive — do not widen this allowance without the same
 *       per-site confirmation.
 *
 * GUARDED (excludes a chain from D1, downgrades it to D2): the exact same
 * `getElementById('X')` call appears immediately before this one, followed by `?`
 * (the `cond ? cond.prop : fallback` re-check idiom used across this suite).
 *
 * Deliberately NOT resolved dynamically: string-concatenation ids
 * (`getElementById('optText' + i)`) are not literal-argument calls at all and are
 * skipped entirely (undecidable statically either way) — same scope boundary as
 * `check-ap2-validate.mjs`'s A1 check.
 *
 * Usage: node scripts/check-dangling-dom.mjs
 * Exit 0 = no D1 findings (D2 findings print but never fail). Exit 1 = one or more D1.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXCLUDE_DIRS = new Set(['scripts', 'node_modules', '.git', '.github', 'ARCHIVE', 'assets']);

// ── surface (same walk rule as check-ap2-validate.mjs) ───────────────────────
function listDirHtml(dirName) {
  const dir = join(ROOT, dirName);
  const ents = readdirSync(dir, { withFileTypes: true });
  const nested = ents
    .filter(e => e.isDirectory() && existsSync(join(dir, e.name, 'index.html')))
    .map(e => [join(dirName, e.name), join(dir, e.name, 'index.html')]);
  const flat = ents
    .filter(e => e.isFile() && e.name.endsWith('.html'))
    .map(e => [join(dirName, e.name), join(dir, e.name)]);
  return nested.concat(flat);
}
function listPages() {
  const rootEnts = readdirSync(ROOT, { withFileTypes: true });
  const rootHtml = rootEnts
    .filter(e => e.isFile() && e.name.endsWith('.html'))
    .map(e => [e.name, join(ROOT, e.name)]);
  const subDirPages = rootEnts
    .filter(e => e.isDirectory() && !EXCLUDE_DIRS.has(e.name) && !e.name.startsWith('.'))
    .flatMap(e => listDirHtml(e.name));
  return rootHtml.concat(subDirPages).sort((a, b) => a[0].localeCompare(b[0]));
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Every literal id="X" attribute in the file (X has no ${...} interpolation). */
function literalIds(html) {
  const ids = new Set();
  const re = /\bid\s*=\s*["']([^"']*)["']/g;
  let m;
  while ((m = re.exec(html))) {
    if (!m[1].includes('${')) ids.add(m[1]);
  }
  return ids;
}

/**
 * Every DYNAMIC ID TEMPLATE — an id="...${...}..." attribute — turned into a regex
 * that matches whatever it renders to at runtime (e.g. id="p${n}Name" → /^p.*Name$/).
 */
function dynamicIdPatterns(html) {
  const patterns = [];
  const re = /\bid\s*=\s*["']([^"']*\$\{[^}]*\}[^"']*)["']/g;
  let m;
  while ((m = re.exec(html))) {
    const tmpl = m[1];
    const parts = tmpl.split(/\$\{[^}]*\}/).map(escapeRegex);
    patterns.push(new RegExp('^' + parts.join('.*') + '$'));
  }
  return patterns;
}

function resolves(id, ids, dynPatterns) {
  if (ids.has(id)) return true;
  return dynPatterns.some(re => re.test(id));
}

// ── main scan ──────────────────────────────────────────────────────────────
const d1 = []; // blocking
const d2 = []; // warn
let pages = 0, calls = 0;

for (const [, file] of listPages()) {
  pages++;
  const html = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const ids = literalIds(html);
  const dynPatterns = dynamicIdPatterns(html);
  const lineOf = (off) => html.slice(0, off).split('\n').length;

  const callRe = /\bgetElementById\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  let m;
  while ((m = callRe.exec(html))) {
    const id = m[2];
    calls++;
    if (resolves(id, ids, dynPatterns)) continue;

    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    const isChained = /^\s*\./.test(html.slice(matchEnd, matchEnd + 3));

    const before = html.slice(Math.max(0, matchStart - m[0].length - 5), matchStart);
    const guardRe = new RegExp('getElementById\\s*\\(\\s*[\'"]' + escapeRegex(id) + '[\'"]\\s*\\)\\s*\\?\\s*$');
    const guarded = guardRe.test(before);

    const line = lineOf(matchStart);
    const snippet = html.slice(matchStart, matchStart + 90).replace(/\s+/g, ' ');

    if (isChained && !guarded) {
      d1.push({ rel, line, id, snippet });
    } else {
      d2.push({ rel, line, id, snippet });
    }
  }
}

if (d2.length) {
  console.log(`\ncheck-dangling-dom: ${d2.length} D2 dangling reference(s) (warn-only, not blocking):\n`);
  for (const f of d2) console.log(`  ⚠ D2 ${f.rel}:${f.line} — getElementById('${f.id}') — ${f.snippet}`);
  console.log('\nD2 findings are printed for visibility. A D2 graduates to blocking D1 if its');
  console.log('call is later chained without a guard, or its guard is removed — re-run this');
  console.log('gate after editing any function touching the ids listed above.\n');
}

if (d1.length) {
  console.error(`check-dangling-dom: ${d1.length} D1 UNGUARDED-CHAIN violation(s) — BLOCKING:\n`);
  for (const f of d1) {
    console.error(`  ✗ D1 ${f.rel}:${f.line} — getElementById('${f.id}') — ${f.snippet}`);
  }
  console.error('\nNo id="' + '<the referenced value>' + '" (literal or dynamically-templated) exists');
  console.error('anywhere in the file, and the call is dereferenced with no guard — this throws');
  console.error('unconditionally the moment its enclosing function runs. Fix the id or delete the');
  console.error('dead line (CG-25: additive-only — deleting a dead init line is fine, restructuring');
  console.error('around it is not). No baseline, no exception list.');
  process.exit(1);
}

console.log(`✓ check-dangling-dom: ${pages} pages, ${calls} getElementById() calls — 0 blocking (D1) violations` + (d2.length ? `, ${d2.length} D2 warned above.` : '.'));
process.exit(0);
