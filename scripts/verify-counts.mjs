#!/usr/bin/env node
/**
 * scripts/verify-counts.mjs — Count-drift prevention gate (AL-HOMESPLIT, CG-32).
 *
 * Mirrors AINumbers.co's scripts/verify-counts.mjs. Splitting index.html
 * (curated landing) from tools.html (full catalog) meant tools.html's own
 * count sites stay self-healing (JS derives them from the live .tool-card DOM
 * at load — see syncCounts() in tools.html), but index.html's hero/topic-tile
 * numbers are no longer next to a countable grid. This gate is what replaces
 * that runtime self-healing for every count that now has to be hand-typed.
 *
 * Two modes:
 *   node scripts/verify-counts.mjs          # --check (CI default)
 *   node scripts/verify-counts.mjs --fix    # write correct values to all sentinel sites
 *
 * Sentinel formats checked:
 *   1. HTML comment sentinels in element text content:
 *        <!--COUNT:key-->N<!--/COUNT-->
 *   2. ATTR_RULES — file-specific regex patterns for meta content and <title>
 *      text, where an HTML comment can't be used (attribute values) or would
 *      render literally (rawtext elements like <title>).
 *
 * Exit 1 on any mismatch in --check mode. Not auto-fixable drift (a declared
 * rule whose regex matches nothing) also fails — a count that can't be
 * located can't be verified.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { deriveCounts } from './counts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FIX = process.argv.includes('--fix');

const read = rel => readFileSync(resolve(ROOT, rel), 'utf8');
const write = (rel, txt) => writeFileSync(resolve(ROOT, rel), txt, 'utf8');

const C = deriveCounts();

// ── 1. HTML comment sentinel scanner/fixer ───────────────────────────────────

const SENTINEL_RE = /<!--COUNT:([^-]+?)-->(\d+)<!--\/COUNT-->/g;

function checkHtmlSentinels(rel) {
  let html = read(rel);
  let drifted = 0;
  let changed = false;

  html = html.replace(SENTINEL_RE, (match, key, valStr) => {
    const expected = C[key];
    if (expected === undefined) {
      console.warn(`UNKNOWN-KEY  ${rel}  key="${key}" not in deriveCounts() — skipping`);
      return match;
    }
    const got = parseInt(valStr, 10);
    if (got !== expected) {
      console.log(`DRIFT  ${rel}  <!--COUNT:${key}-->  expected=${expected} got=${got}`);
      drifted++;
      if (FIX) { changed = true; return `<!--COUNT:${key}-->${expected}<!--/COUNT-->`; }
    } else {
      console.log(`OK     ${rel}  <!--COUNT:${key}-->  ${got}`);
    }
    return match;
  });

  if (FIX && changed) { write(rel, html); console.log(`WROTE  ${rel}`); }
  return drifted;
}

// ── 2. Attribute / title-text rules ──────────────────────────────────────────
//
// Each rule: { file, key, label, regex }
//   regex has exactly 3 capture groups: (prefix)(digits)(suffix).
// --fix mode replaces group 2 with the expected value; --check mode reports.

const ATTR_RULES = [
  // ── index.html (curated landing) ──────────────────────────────────────────
  { file: 'index.html', key: 'tools', label: 'meta description (tools)',
    regex: /(<meta name="description" content=")(\d+)( free, open-source)/,
  },
  { file: 'index.html', key: 'showcase', label: 'meta description (showcase)',
    regex: /(planning, plus an )(\d+)(-exemplar OpenChainGraph showcase)/,
  },
  { file: 'index.html', key: 'tools', label: 'og:description',
    regex: /(<meta property="og:description" content=")(\d+)( deterministic career and education engines)/,
  },

  // ── tools.html (full catalog) ─────────────────────────────────────────────
  { file: 'tools.html', key: 'tools', label: 'title',
    regex: /(<title>All Tools: ApexLogics Full Catalog — )(\d+)( Deterministic Career)/,
  },
  { file: 'tools.html', key: 'tools', label: 'meta description',
    regex: /(<meta name="description" content="Browse all )(\d+)( free, open-source)/,
  },
  { file: 'tools.html', key: 'tools', label: 'og:description',
    regex: /(<meta property="og:description" content=")(\d+)( deterministic career and education engines)/,
  },
];

function checkAttrRules() {
  const byFile = new Map();
  for (const rule of ATTR_RULES) {
    if (!byFile.has(rule.file)) byFile.set(rule.file, []);
    byFile.get(rule.file).push(rule);
  }

  let total = 0;
  for (const [file, rules] of byFile) {
    let content = read(file);
    let changed = false;
    for (const { key, label, regex } of rules) {
      const expected = C[key];
      if (expected === undefined) {
        console.warn(`UNKNOWN-KEY  ${file}  key="${key}" — skipping`);
        continue;
      }
      let matched = false;
      content = content.replace(regex, (match, pre, valStr, post) => {
        matched = true;
        const got = parseInt(valStr, 10);
        if (got !== expected) {
          console.log(`DRIFT  ${file}  ${label}  expected=${expected} got=${got}`);
          total++;
          if (FIX) { changed = true; return `${pre}${expected}${post}`; }
        } else {
          console.log(`OK     ${file}  ${label}  ${got}`);
        }
        return match;
      });
      if (!matched) {
        console.log(`NO-MATCH  ${file}  ${label}  regex did not match anything — FAIL (update or remove this rule)`);
        total++;
      }
    }
    if (FIX && changed) { write(file, content); console.log(`WROTE  ${file}`); }
  }
  return total;
}

// ── 3. Run all checks ──────────────────────────────────────────────────────

let total = 0;

for (const rel of ['index.html', 'tools.html']) {
  total += checkHtmlSentinels(rel);
}

total += checkAttrRules();

// ── 4. Result ────────────────────────────────────────────────────────────────

if (total === 0) {
  console.log('\nAll counts in sync.');
  process.exit(0);
} else if (FIX) {
  console.log(`\nFixed ${total} count(s).`);
  process.exit(0);
} else {
  console.log(`\n${total} count(s) drifted. Run with --fix to repair.`);
  process.exit(1);
}
