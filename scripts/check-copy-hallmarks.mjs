#!/usr/bin/env node
/**
 * scripts/check-copy-hallmarks.mjs — AI-writing hallmark gate (COPY-GATE-2, board/done).
 *
 * Ports the AINumbers.co anti-AI-tell copy lint (AINumbers memory
 * `feedback-anti-ai-tell-copy-ban`, standing order line 11) to Apex Logics, scoped
 * to what STANDING-ORDERS.md line 11 actually asks for: no em-dashes in
 * reader-facing copy, no "not fintech" framing, and strapline consistency —
 * plus the core ANTI-AI-TELL categories from the same ban list (italics-for-
 * emphasis, "not just X but Y", dramatic fragments, validation phrasing,
 * filler vocab, "it's not X, it's Y" pivot, decorative emoji in headers).
 * chaingraph.json descriptions, the SCOPE-panel heuristic, and the H1/H5
 * insider-register/AI-vocab buckets from the AINumbers original are NOT
 * ported — out of STANDING-ORDERS.md line 11's scope for this port.
 *
 * BASELINE+RATCHET (three categories only — pre-land scan found real legacy
 * debt, same shape as AINumbers' own em-dash history): em-dash, italics-for-
 * emphasis, emoji-in-header. `scripts/copy-hallmarks-baseline.json` shields a
 * file's already-measured count; a file may not exceed its baselined count,
 * and files absent from the baseline must be clean. `--update` regenerates
 * the baseline from the current tree (never grows it to hide a NEW hit —
 * that always fails first). Every other category below is ZERO-TOLERANCE,
 * NO BASELINE — the pre-land scan found (after two direct fixes: the one
 * "not just X but" hit in tools/82-payroll-efficiency-classroom/index.html,
 * and the strapline-scan false positive that a whole-page-text scan produced
 * from tag-boundary collapse, fixed by scoping the strapline check to single
 * title/h[1-6]/meta[description] tags) zero legacy debt in these buckets, so
 * there is nothing to shield.
 *
 * "Not fintech" ban (AL-specific, STANDING-ORDERS.md line 11): the suite's
 * strapline is "deterministic decision engines for people, creators, and
 * agents" against sister sites AINumbers (markets & institutions) and OCS
 * (science & evidence) — the positioning is never framed as a negation of
 * fintech. Zero tolerance, no baseline.
 *
 * Strapline consistency: every page that carries the strapline sentence must
 * match the canonical wording exactly (case/punctuation-insensitive) — no
 * silent drift between index.html / tools.html / showcase/index.html / any
 * future page that adopts it.
 *
 * Usage:
 *   node scripts/check-copy-hallmarks.mjs            # gate (preflight + CI)
 *   node scripts/check-copy-hallmarks.mjs --update   # regenerate the em-dash/italics/emoji-header baseline
 * Exit 0 = clean. Exit 1 = one or more violations (path + reason printed).
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASELINE_PATH = resolve(__dirname, 'copy-hallmarks-baseline.json');
const UPDATE = process.argv.includes('--update');

// Same hand-rolled glob approach as check-no-storage.mjs (CI pins Node 20;
// fs.globSync is Node 22+).
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

// CONTRACT §1.3 PII banner is mandated verbatim; strip it before scanning so its
// own em-dash never trips this gate (same precedent as the AINumbers original).
const PII_BANNER = '🔒 All inputs are processed locally in your browser. Nothing is transmitted, stored, or logged. Inputs disappear when you close the tab.';

function decodeDashEntities(html) {
  return html
    .replace(/&mdash;/gi, '—')
    .replace(/&#0*8212;/g, '—')
    .replace(/&#x0*2014;/gi, '—');
}

/** Strip script/style/pre/code bodies + HTML comments, keep other tags intact. */
function proseHtml(html) {
  return decodeDashEntities(html)
    .split(PII_BANNER).join(' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, ' ')
    .replace(/<code\b[\s\S]*?<\/code>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function visibleText(html) {
  return proseHtml(html).replace(/<[^>]+>/g, ' ');
}

function headerText(prose) {
  const out = [];
  const re = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let m;
  while ((m = re.exec(prose))) out.push(m[1].replace(/<[^>]+>/g, ' '));
  return out.join(' ');
}

const EMDASH = /—/g;

// AL-specific positioning ban (STANDING-ORDERS.md line 11): the suite is never
// framed as a negation of the sister fintech site.
const NOT_FINTECH = /\bnot\s+fintech\b/gi;

// Strapline consistency: canonical wording, normalized for case/trailing period/
// whitespace before comparison. Matches "Deterministic decision engines for
// people, creators, and agents" with any capitalization and optional trailing ".".
// Scoped to single-tag text content (title/h1/h2/meta content=) rather than the
// flattened whole-page text — visibleText() collapses tag boundaries to a single
// space, so a strapline sentence immediately followed by an unrelated heading
// would otherwise run together into one false "drift" match.
const STRAPLINE_TAG_RE = /<title\b[^>]*>([^<]*)<\/title>|<h[1-6]\b[^>]*>([^<]*)<\/h[1-6]>|<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*>/gi;
const STRAPLINE_PHRASE_RE = /deterministic\s+decision\s+engines\s+for\s+[^.\n]{0,80}/i;
const STRAPLINE_CANON = 'deterministic decision engines for people, creators, and agents';
function normalizeStrapline(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
}

// --- ANTI-AI-TELL BAN (ported from AINumbers memory feedback-anti-ai-tell-copy-ban) ---
const NOTJUSTBUT = [
  [/\bnot\s+just\b(?:(?!\bbut\b)[^.?!]){0,80}\bbut\b/gi, '"not just X but" construction'],
  [/\bisn['’]?t\s+just\b/gi, '"isn\'t just"'],
  [/\bmore\s+than\s+just\b/gi, '"more than just"'],
];
const DRAMATIC_FRAGMENT = /\bThe (?:result|catch|takeaway|verdict|kicker|bottom line)\?/gi;
const VALIDATION_PHRASING = /\byou['’]?re\s+not\s+(?:alone|imagining\s+(?:it|things))\b/gi;
const TWOTONE_COMMA = /\b(?:it['’]?s|it is|this is|that['’]?s|there['’]?s)\s+not\s+[^,.!?]{1,70},\s+(?:it['’]?s\s+about|it['’]?s|it is|they['’]?re)\b/gi;
const TWOTONE_HIGHPRECISION = /\b(?:is|are|was|were) not (?:a|an|the )?[\w-]+\.\s+(?:It|They|This|That) (?:is|are)\b/g;
const FILLER_VOCAB = [
  [/\bdelv(?:e|es|ed|ing)\b/gi, 'delve'],
  [/\btapestr(?:y|ies)\b/gi, 'tapestry'],
  [/\btestament\s+to\b/gi, 'testament to'],
  [/\bquiet(?:ly)?\s+(?:revolution|shift|force|power|evolution)\b/gi, 'quiet(ly) X'],
  [/\bseamless(?:ly)?\b/gi, 'seamless'],
  [/\bgame[\s-]?chang(?:er|ing)\b/gi, 'game-changer'],
  [/\bdelve\s+into\b/gi, 'delve into'],
  [/\bit['’]?s\s+worth\s+noting\b/gi, "it's worth noting"],
  [/\bin\s+today['’]?s\s+fast-paced\b/gi, "in today's fast-paced"],
];
// Functional PASS/WARN/FAIL/lock iconography used across every tool's results
// rendering (CONTRACT §1.3/§6) — not the decorative-emoji tell this ban targets.
const EMOJI = /[\u{2600}-\u{27BF}\u{1F300}-\u{1FAFF}]/gu;
const EMOJI_UI_EXEMPT = new Set(['✓', '✗', '✔', '✔️', '❌', '✅', '⚠', '⚠️', '🔒', '🔏', '🚫', '☑', '☑️', '➡', '➡️', '→', '⭐', '★', '☆', '❓', '❗', '‼', '⏳', '⏱', '⏱️']);
function nonExemptEmoji(text) {
  return (text.match(EMOJI) || []).filter((ch) => !EMOJI_UI_EXEMPT.has(ch));
}

function scanFile(absPath) {
  const rel = relative(ROOT, absPath).replace(/\\/g, '/');
  const raw = readFileSync(absPath, 'utf8');
  const prose = proseHtml(raw);
  const text = visibleText(raw);
  const zeroTolerance = []; // reasons that always fail, no baseline

  const notFintech = (text.match(NOT_FINTECH) || []).length;
  if (notFintech) zeroTolerance.push(`${notFintech} "not fintech" hit(s) — CONTRACT positioning ban`);

  STRAPLINE_TAG_RE.lastIndex = 0;
  let tm;
  while ((tm = STRAPLINE_TAG_RE.exec(raw))) {
    const tagText = tm[1] || tm[2] || tm[3] || '';
    const pm = tagText.match(STRAPLINE_PHRASE_RE);
    if (pm && normalizeStrapline(pm[0]) !== STRAPLINE_CANON) {
      zeroTolerance.push(`strapline drift: "${pm[0].trim()}" does not match canonical "${STRAPLINE_CANON}"`);
    }
  }

  for (const [re, label] of NOTJUSTBUT) {
    const m = text.match(re) || [];
    if (m.length) zeroTolerance.push(`${label} ×${m.length}`);
  }
  const dramatic = (text.match(DRAMATIC_FRAGMENT) || []).length;
  if (dramatic) zeroTolerance.push(`dramatic-fragment ×${dramatic}`);
  const validation = (text.match(VALIDATION_PHRASING) || []).length;
  if (validation) zeroTolerance.push(`validation-phrasing ×${validation}`);
  const twotoneComma = (text.match(TWOTONE_COMMA) || []).length;
  if (twotoneComma) zeroTolerance.push(`"it's not X, it's Y" pivot ×${twotoneComma}`);
  const twotoneHP = (text.match(TWOTONE_HIGHPRECISION) || []).length;
  if (twotoneHP) zeroTolerance.push(`HIGH-PRECISION twotone construction ×${twotoneHP} ("It is not X. It is Y." family)`);
  for (const [re, label] of FILLER_VOCAB) {
    const m = text.match(re) || [];
    if (m.length) zeroTolerance.push(`filler-vocab "${label}" ×${m.length}`);
  }

  const emdash = (text.match(EMDASH) || []).length;
  const italics = (prose.match(/<(em|i)\b[^>]*>[^<]+<\/\1>/gi) || []).length;
  const emojiHeaders = nonExemptEmoji(headerText(prose)).length;

  return { rel, zeroTolerance, ratchet: { emdash, italics, emojiHeaders } };
}

const results = [];
for (const pattern of GLOBS) {
  const files = expandGlob(pattern);
  for (const f of files) {
    results.push(scanFile(resolve(ROOT, f)));
  }
}

if (UPDATE) {
  const baseline = {};
  for (const r of results) {
    const { emdash, italics, emojiHeaders } = r.ratchet;
    if (emdash || italics || emojiHeaders) baseline[r.rel] = { emdash, italics, emojiHeaders };
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`check-copy-hallmarks: baseline written for ${Object.keys(baseline).length} file(s).`);
  process.exit(0);
}

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};
const failures = [];
const improvements = [];

for (const r of results) {
  for (const reason of r.zeroTolerance) failures.push(`${r.rel}  ${reason}`);

  const b = baseline[r.rel] || { emdash: 0, italics: 0, emojiHeaders: 0 };
  const { emdash, italics, emojiHeaders } = r.ratchet;
  if (emdash > b.emdash) failures.push(`${r.rel}  ${emdash} em-dash(es) in visible text (baseline ${b.emdash})`);
  else if (emdash < b.emdash) improvements.push(`${r.rel}: em-dash ${b.emdash} -> ${emdash}`);
  if (italics > b.italics) failures.push(`${r.rel}  ${italics} italics-for-emphasis hit(s) (baseline ${b.italics})`);
  else if (italics < b.italics) improvements.push(`${r.rel}: italics ${b.italics} -> ${italics}`);
  if (emojiHeaders > b.emojiHeaders) failures.push(`${r.rel}  ${emojiHeaders} emoji-in-header hit(s) (baseline ${b.emojiHeaders})`);
  else if (emojiHeaders < b.emojiHeaders) improvements.push(`${r.rel}: emoji-in-header ${b.emojiHeaders} -> ${emojiHeaders}`);
}
const scannedRel = new Set(results.map(r => r.rel));
for (const rel of Object.keys(baseline)) {
  if (!scannedRel.has(rel)) improvements.push(`${rel}: file gone (baseline entry can be dropped)`);
}

if (improvements.length) {
  console.log(`copy-hallmarks: ${improvements.length} file(s) beat the baseline — tighten with --update:\n  ` + improvements.slice(0, 10).join('\n  '));
}
if (failures.length) {
  console.error(`\ncheck-copy-hallmarks: ${failures.length} FAILURE(s):\n  ` + failures.join('\n  '));
  console.error('\nem-dash/italics/emoji-in-header: baseline burns down with --update. Everything else (not-fintech framing, strapline drift, "not just X but", dramatic fragments, validation-phrasing, twotone pivots, filler vocab): zero-tolerance, no baseline — rewrite the copy (STANDING-ORDERS.md line 11 / memory feedback-anti-ai-tell-copy-ban).');
  process.exit(1);
}
console.log(`check-copy-hallmarks: OK (${Object.keys(baseline).length} baselined file(s) within budget, 0 zero-tolerance hits).`);
