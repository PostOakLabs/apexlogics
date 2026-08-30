#!/usr/bin/env node
/**
 * scripts/check-constants-vintage.mjs — Constants-vintage gate (G2, AL-CI-VINTAGE).
 *
 * `repo/data/apex-constants-2026.js` is a real, sourced SSOT that `chaingraph/chaingraph.json`
 * already points at (`constants_ssot_ref`), but nothing enforced it — 0 of 168 tools load it,
 * and CONTRACT §3.5.3's "diff every tool at rollover" instruction was a manual step with no
 * gate behind it. That let `08-severance-decision-engine` ship computing federal income tax
 * on 2024 IRS Pub 15-T tables while its own visible banner, AP2 manifest, and JSON-LD all
 * asserted "IRS Rev. Proc. 2025-32 (2026)" — a false declaration invisible to anyone auditing
 * manifests, because the tool's Social Security wage base WAS on the 2026 value (AL-CI-VINTAGE
 * / AL-AUDIT-COMPUTE-INTEGRITY.md §C-1/§B-1).
 *
 * Two independent checks, run per tool:
 *
 *   (a) SSOT match — for each named constant this gate knows how to find (CURRENT_YEAR,
 *       SS_WAGE_BASE, STD_DEDUCTION single/mfj/hoh, AMT exemption/phaseout single/mfj), does the value
 *       embedded in the tool match the current apex-constants-2026.js value? A tool is free
 *       to not embed a constant at all (not every tool does payroll tax); this only fires
 *       when a recognized constant name IS present with a stale value.
 *
 *   (b) Declared-vs-embedded vintage — for each embedded constant this gate recognizes, what
 *       tax year does that VALUE actually belong to (via YEAR_FINGERPRINTS below)? If that
 *       year doesn't appear anywhere in the tool's declared data_vintage strings (manifest.json
 *       + the inline manifest/MANIFEST objects in index.html), the declaration and the code
 *       disagree — this is the half that (a) alone cannot catch, because a tool can be
 *       internally split (one constant on the new year, another still stale) while every
 *       declared-vintage surface names only the new year. This is exactly the `08` defect:
 *       SS_WAGE_BASE was already 2026, so (a) passes on it, but STD_DEDUCTION was 2024 while
 *       every declaration said 2026 — this half catches it via the STD_DEDUCTION sensor.
 *
 * Deliberately scoped to a curated set of named constants (matched by JS identifier, not by
 * bare literal — a coincidental "16100" in an unrelated formula is not a hit). Coverage gap:
 * a tool that inlines the same values under an unrecognized variable name isn't scanned. That
 * mirrors check-no-storage.mjs's own tradeoff (name/API match over blanket literal scanning)
 * and is what to widen first if this gate needs to catch more.
 *
 * Usage: node scripts/check-constants-vintage.mjs
 * Exit 0 = clean. Exit 1 = one or more violations (path:line + kind + detail printed).
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SSOT_PATH = resolve(ROOT, 'data', 'apex-constants-2026.js');
const SSOT_YEAR = 2026;

function extractSsot(text) {
  const num = (re) => {
    const m = text.match(re);
    return m ? Number(m[1]) : null;
  };
  return {
    CURRENT_YEAR: num(/CURRENT_YEAR:\s*(\d+)/),
    SS_WAGE_BASE: num(/SS_WAGE_BASE:\s*(\d+)/),
    STD_DEDUCTION_single: num(/STD_DEDUCTION:\s*\{\s*single:\s*(\d+)/),
    STD_DEDUCTION_mfj: num(/STD_DEDUCTION:\s*\{[^}]*mfj:\s*(\d+)/),
    STD_DEDUCTION_hoh: num(/STD_DEDUCTION:\s*\{[^}]*hoh:\s*(\d+)/),
    AMT_EXEMPTION_single: num(/exemption:\s*\{\s*single:\s*(\d+)/),
    AMT_EXEMPTION_mfj: num(/exemption:\s*\{[^}]*mfj:\s*(\d+)/),
    AMT_PHASEOUT_single: num(/phaseoutStart:\s*\{\s*single:\s*(\d+)/),
    AMT_PHASEOUT_mfj: num(/phaseoutStart:\s*\{[^}]*mfj:\s*(\d+)/),
  };
}

const ssotText = readFileSync(SSOT_PATH, 'utf8');
const SSOT = extractSsot(ssotText);

// Known historical values for the same fields, used ONLY to name which tax year an embedded
// value belongs to (for the declared-vs-embedded check). Sourced from IRS Rev. Proc. rollovers
// / SSA COLA fact sheets for each year. Not reader-facing — internal fingerprint table.
const YEAR_FINGERPRINTS = {
  SS_WAGE_BASE:          { 160200: 2023, 168600: 2024, 176100: 2025, 184500: 2026 },
  STD_DEDUCTION_single:  { 13850: 2023, 14600: 2024, 15000: 2025, 16100: 2026 },
  STD_DEDUCTION_mfj:     { 27700: 2023, 29200: 2024, 30000: 2025, 32200: 2026 },
  STD_DEDUCTION_hoh:     { 20800: 2023, 21900: 2024, 22500: 2025, 24150: 2026 },
  AMT_EXEMPTION_single:  { 81300: 2023, 85700: 2024, 88100: 2025, 90100: 2026 },
  AMT_EXEMPTION_mfj:     { 126500: 2023, 133300: 2024, 137000: 2025, 140200: 2026 },
  AMT_PHASEOUT_single:   { 578150: 2023, 609350: 2024, 626350: 2025, 500000: 2026 },
  AMT_PHASEOUT_mfj:      { 1156300: 2023, 1218700: 2024, 1252700: 2025, 1000000: 2026 },
};

// Per-sensor: find a JS identifier co-occurring with a field name on the same line and pull
// its numeric value. Line-based (not a full parser) — matches this codebase's one-line style:
// `const STD_DEDUCTION = { single: 16100, mfj: 32200, hoh: 24150 };`
// CURRENT_YEAR has no YEAR_FINGERPRINTS/SENSOR_TOPIC_RE entry — it's the rollover anchor
// itself (AL-CI-HASHDOMAIN's `new Date().getFullYear()` replacement), not a dollar-value
// fact with distinguishable per-year values to fingerprint. Only the (a) SSOT-match check
// applies to it; the (b) declared-vs-embedded check below no-ops for any sensor missing a
// fingerprint table, which is exactly what's wanted here.
const SENSORS = [
  { key: 'CURRENT_YEAR',         re: /\bCURRENT_YEAR\s*=\s*(\d+)/ },
  { key: 'SS_WAGE_BASE',         re: /\bSS_WAGE_BASE\s*[:=]\s*(\d+)/ },
  { key: 'STD_DEDUCTION_single', re: /\b(?:STD_DEDUCTION|STD_DED)\b[^\n]*?\bsingle\s*:\s*(\d+)/ },
  { key: 'STD_DEDUCTION_mfj',    re: /\b(?:STD_DEDUCTION|STD_DED)\b[^\n]*?\bmfj\s*:\s*(\d+)/ },
  { key: 'STD_DEDUCTION_hoh',    re: /\b(?:STD_DEDUCTION|STD_DED)\b[^\n]*?\bhoh\s*:\s*(\d+)/ },
  { key: 'AMT_EXEMPTION_single', re: /\bAMT_EXEMPTIONS?\b[^\n]*?\bsingle\s*:\s*(\d+)/ },
  { key: 'AMT_EXEMPTION_mfj',    re: /\bAMT_EXEMPTIONS?\b[^\n]*?\bmfj\s*:\s*(\d+)/ },
  { key: 'AMT_PHASEOUT_single',  re: /\bAMT_PHASEOUT\b[^\n]*?\bsingle\s*:\s*(\d+)/ },
  { key: 'AMT_PHASEOUT_mfj',     re: /\bAMT_PHASEOUT\b[^\n]*?\bmfj\s*:\s*(\d+)/ },
];

const YEAR_TOKEN_RE = /\b(20[2-3]\d)\b/g;

// IRS Revenue Procedure citations ("Rev. Proc. 2025-32") are dated by the year they were
// PUBLISHED, not the tax year they govern — that's always publish-year + 1 (2025-32 governs
// 2026; 2023-34 governs 2024; confirmed against every citation number in this repo). AL-G2-
// HALFB probe 1: editing only the citation number ("2025-32" → "2023-34") while an adjacent
// "(2026 ...)" phrase happened to survive the edit left a genuinely stale citation sitting
// next to a leftover-but-still-literally-true "2026" token in the SAME string — a plain
// "does this string contain the year 2026 anywhere" scan can't tell that apart from a correct
// declaration, because both contain the token. The citation number itself doesn't lie: once a
// Rev Proc citation is present, ITS implied year is authoritative for this check (not the
// surrounding literal year tokens, which is exactly the "found 2026 elsewhere in the same
// string" failure mode this was rewritten to close).
const REV_PROC_RE = /rev\.?\s*proc\.?\s*(\d{4})-\d+/gi;
function revProcImpliedYears(str) {
  const years = new Set();
  let m;
  REV_PROC_RE.lastIndex = 0;
  while ((m = REV_PROC_RE.exec(str))) years.add(Number(m[1]) + 1);
  return years;
}

// Guards the declared-vs-embedded check against firing on a data_vintage string that is real
// and dated but is not ABOUT the constant a sensor found — e.g. a tool that embeds the 2026
// SS wage base incidentally (a payroll cap inside an unrelated calculation) while its declared
// data_vintage describes 2023/2024 labor-market survey citations (SHRM, BLS, NALP, ...) that
// have nothing to do with payroll tax. Mirrors the audit's own method: it read all 13 tools
// claiming a tax vintage before calling `08` the sole mismatch, rather than pattern-matching
// blind. Only fire when the declared text is actually talking about this sensor's topic.
// STD_DEDUCTION_* was widened from a bare `/standard deduction/i` match (AL-G2-HALFB):
// every real tool that embeds STD_DEDUCTION declares its vintage via a bracket/Rev-Proc
// citation ("IRS Rev. Proc. 2025-32 (2026 brackets)", "IRS 2026 brackets"), never the
// literal phrase "standard deduction" — so the narrow regex never matched on any of the
// 7 tools that carry this sensor, leaving half B permanently inert for this constant.
const SENSOR_TOPIC_RE = {
  SS_WAGE_BASE: /wage base|social security|\bfica\b|\bss\b/i,
  STD_DEDUCTION_single: /standard deduction|\bbrackets?\b|rev\.?\s*proc\.?/i,
  STD_DEDUCTION_mfj: /standard deduction|\bbrackets?\b|rev\.?\s*proc\.?/i,
  STD_DEDUCTION_hoh: /standard deduction|\bbrackets?\b|rev\.?\s*proc\.?/i,
  AMT_EXEMPTION_single: /\bamt\b|alternative minimum/i,
  AMT_EXEMPTION_mfj: /\bamt\b|alternative minimum/i,
  AMT_PHASEOUT_single: /\bamt\b|alternative minimum/i,
  AMT_PHASEOUT_mfj: /\bamt\b|alternative minimum/i,
};

function expandToolDirs() {
  const baseAbs = resolve(ROOT, 'tools');
  let entries;
  try {
    entries = readdirSync(baseAbs);
  } catch {
    return [];
  }
  return entries.filter((name) => statSync(join(baseAbs, name)).isDirectory());
}

function yearsIn(str) {
  const years = new Set();
  let m;
  YEAR_TOKEN_RE.lastIndex = 0;
  while ((m = YEAR_TOKEN_RE.exec(str))) years.add(Number(m[1]));
  return years;
}

function lineOf(htmlText, index) {
  return htmlText.slice(0, index).split('\n').length;
}

// Returns one entry PER declared-vintage SURFACE — never merged into one blob. AL-G2-HALFB:
// the original version unioned every surface's text/years into a single set before checking,
// so one correct surface (or even an unrelated year mentioned in the SAME string, e.g. "SSA
// 2026 wage base" sitting next to a stale std-deduction citation) masked every other surface
// being wrong. Each surface below is checked independently in scanTool().
function declaredVintageEntries(slug, htmlText) {
  const entries = [];

  // manifest.json data_vintage
  try {
    const manifestPath = resolve(ROOT, 'tools', slug, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (typeof manifest.data_vintage === 'string') {
      entries.push({
        file: `tools/${slug}/manifest.json`,
        line: null,
        label: 'manifest.json data_vintage',
        text: manifest.data_vintage,
        years: yearsIn(manifest.data_vintage),
      });
    }
  } catch {
    /* no manifest.json or unparsable — not this gate's concern */
  }

  // inline data_vintage: '...' / "data_vintage": "..." occurrences in index.html (covers the
  // runtime `manifest`/`MANIFEST` JS objects and JSON-LD blocks) — one entry per occurrence.
  const inlineRe = /data_vintage['"]?\s*:\s*['"]([^'"]*)['"]/g;
  let m;
  while ((m = inlineRe.exec(htmlText))) {
    entries.push({
      file: `tools/${slug}/index.html`,
      line: lineOf(htmlText, m.index),
      label: 'inline data_vintage',
      text: m[1],
      years: yearsIn(m[1]),
    });
  }

  // visible tool-vintage-banner — the user-facing claim, previously not scanned at all
  // (AL-G2-HALFB probe 3). Content may sit directly in the element or inside a nested
  // <span>/<div> (some tools wrap it for i18n-chrome markup); strip tags before reading.
  const bannerRe = /class="tool-vintage-banner">([\s\S]*?)<\/(?:div|span)>/g;
  while ((m = bannerRe.exec(htmlText))) {
    const raw = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    entries.push({
      file: `tools/${slug}/index.html`,
      line: lineOf(htmlText, m.index),
      label: 'tool-vintage-banner',
      text: raw,
      years: yearsIn(raw),
    });
  }

  return entries;
}

function scanTool(slug) {
  const violations = [];
  const htmlPath = resolve(ROOT, 'tools', slug, 'index.html');
  let htmlText;
  try {
    htmlText = readFileSync(htmlPath, 'utf8');
  } catch {
    return violations;
  }

  const lines = htmlText.split('\n');
  const declaredEntries = declaredVintageEntries(slug, htmlText);

  for (const sensor of SENSORS) {
    const ssotValue = SSOT[sensor.key];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      const m = line.match(sensor.re);
      if (!m) continue;
      const found = Number(m[1]);

      // (a) SSOT match
      if (ssotValue != null && found !== ssotValue) {
        violations.push({
          file: `tools/${slug}/index.html`,
          line: i + 1,
          kind: 'ssot-mismatch',
          detail: `${sensor.key} = ${found} but apex-constants-2026.js says ${ssotValue}`,
        });
      }

      // (b) declared-vs-embedded vintage — checked PER SURFACE (manifest.json, each inline
      // data_vintage occurrence, the visible banner), never on a merged union of all of them.
      // A surface only has to answer for itself: if it's topically about this sensor (see
      // SENSOR_TOPIC_RE) but doesn't name the year the embedded value actually belongs to,
      // that surface is flagged — even if some OTHER surface on the same tool got it right.
      const fingerprintYear = YEAR_FINGERPRINTS[sensor.key]?.[found];
      const topicRe = SENSOR_TOPIC_RE[sensor.key];
      if (fingerprintYear != null && topicRe) {
        for (const entry of declaredEntries) {
          if (!topicRe.test(entry.text)) continue; // this surface isn't about this constant
          const citationYears = revProcImpliedYears(entry.text);
          // A Rev Proc citation, if present, is authoritative — it overrides any other literal
          // year token sitting in the same string (see REV_PROC_RE comment above).
          const declaredOk = citationYears.size > 0
            ? citationYears.has(fingerprintYear)
            : entry.years.has(fingerprintYear);
          if (declaredOk) continue;
          const namedYears = citationYears.size > 0 ? citationYears : entry.years;
          violations.push({
            file: entry.file,
            line: entry.line ?? 1, // manifest.json has no meaningful line — the embedded-at line is in the detail text
            kind: 'vintage-mismatch',
            detail: `${sensor.key} = ${found} (tax year ${fingerprintYear}, embedded at tools/${slug}/index.html:${i + 1}) but ${entry.label} names ${[...namedYears].sort().join(', ') || '(no year)'}${citationYears.size > 0 ? ' (from its Rev. Proc. citation)' : ''}`,
          });
        }
      }
    }
  }

  return violations;
}

let all = [];
for (const slug of expandToolDirs()) {
  all = all.concat(scanTool(slug));
}

if (all.length === 0) {
  console.log('check-constants-vintage: clean — every recognized constant matches the SSOT and its declared vintage.');
  process.exit(0);
} else {
  console.log(`check-constants-vintage: ${all.length} violation(s):\n`);
  for (const v of all) {
    console.log(`  ${v.file}:${v.line}  [${v.kind}]  ${v.detail}`);
  }
  console.log('\nFix: copy the current block from data/apex-constants-2026.js inline, and make sure');
  console.log('every data_vintage surface (manifest.json + inline manifest/MANIFEST objects) names');
  console.log('the same tax year as what the tool actually computes. No baseline, no exception list.');
  process.exit(1);
}
