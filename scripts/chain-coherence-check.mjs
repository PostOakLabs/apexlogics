#!/usr/bin/env node
// chain-coherence-check.mjs — CHAIN-COHERENCE GATE (G3, AL-CI-HASHDOMAIN).
//
// A chaingraph chain hands one tool's Policy Mandate output to the next. If two tools in
// the SAME chain both embed a "shared constant" (a tax bracket table, SS wage base, AMT
// exemption, standard deduction, FPL table, etc. — the suite has no live SSOT wiring yet,
// see AL-CI-VINTAGE/G2) but disagree on its value, the chain's composite output is
// internally inconsistent: step 2 could compute on one year's numbers while step 4 uses
// another's, with nothing surfacing the contradiction to the user or agent consuming the
// hand-off. AL-AUDIT-COMPUTE-INTEGRITY.md §"Cross-tool agreement across the 42 chains"
// found this is CURRENTLY clean (only 9 tools define a shared constant, only 1 of the
// chains co-locates two of them, and those two agree) — "and only by luck". This gate is
// what keeps it clean as that set grows, per the audit's own G3 proposal.
//
// Usage: node scripts/chain-coherence-check.mjs   (exit 1 on any hit)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }

// Walk the chaingraph looking for every `nodes: [AL-ID, AL-ID, ...]` array, regardless of
// how deeply it's nested under journeys/themes/sub_journeys — that shape IS a chain, and
// the schema doesn't guarantee a fixed nesting depth (some journeys theme their chains,
// others don't).
function findChains(node, path = []) {
  const chains = [];
  const walk = (o, p) => {
    if (Array.isArray(o)) { o.forEach((item, i) => walk(item, p)); return; }
    if (o && typeof o === 'object') {
      if (Array.isArray(o.nodes) && o.nodes.length && o.nodes.every(x => typeof x === 'string')) {
        chains.push({ id: o.id || o.label || p.join('/') || '(unnamed)', nodes: o.nodes });
      }
      for (const k of Object.keys(o)) walk(o[k], [...p, k]);
    }
  };
  walk(node, path);
  return chains;
}

// A "shared constant" candidate: a top-level `const UPPER_SNAKE_NAME = <simple NUMERIC
// literal>;` — a bare number, or a flat object literal whose values are ALL bare numbers
// (the shape every real example in the audit takes: STD_DEDUCTION, SS_WAGE_BASE,
// AMT_EXEMPTIONS/AMT_PHASEOUT, FPL, PELL_MAX). Restricting to numeric-only deliberately
// excludes two classes of same-shaped-but-out-of-scope constant: (1) `MANIFEST` — every
// tool defines one, and it's SUPPOSED to differ per tool (that's per-tool identity
// metadata, not a shared fact); (2) reference/lookup tables of STRINGS like a
// `STATE_NAMES` abbreviation→full-name map — real data-quality drift there is a separate
// concern from "does this tool's embedded tax constant agree with that one's", which is
// what the audit's G3 proposal and AL-CI-VINTAGE (G2) are about. A bare quoted-string
// const is excluded for the same reason (it's typically a label/version, not a fact meant
// to be numerically consistent across tools).
const CONST_RE = /const\s+([A-Z][A-Z0-9_]{2,})\s*=\s*(\{[^{}]*\}|-?\d+(?:\.\d+)?);/g;
const ALL_NUMERIC_OBJECT = /^\{(?:\s*[\w$]+\s*:\s*-?\d+(?:\.\d+)?\s*,?)*\s*\}$/;

function extractConstants(html) {
  const scripts = [];
  const sRe = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let sm;
  while ((sm = sRe.exec(html))) {
    if (/\bsrc\s*=/.test(sm[0].slice(0, sm[0].indexOf('>') + 1))) continue;
    scripts.push(sm[1]);
  }
  const src = scripts.join('\n');
  const out = {};
  let m;
  while ((m = CONST_RE.exec(src))) {
    const raw = m[2].trim();
    if (raw.startsWith('{') && !ALL_NUMERIC_OBJECT.test(raw.replace(/\s+/g, ''))) continue; // has a non-numeric value — not a tax-constant-shaped table
    // comparison key: ALL whitespace stripped (formatting-only differences — spaces
    // after `{`/`,` — must not read as a real disagreement); display value: lightly
    // tidied (collapsed whitespace) so an actual mismatch is still readable in the log.
    out[m[1]] = { key: raw.replace(/\s+/g, ''), display: raw.replace(/\s+/g, ' ').trim() };
  }
  return out;
}

const registry = loadJson(join(REPO, 'suite-registry.json'));
const alToSlug = new Map(registry.tools.map(t => [t.al_id, t.tool_id]));

const chaingraph = loadJson(join(REPO, 'chaingraph', 'chaingraph.json'));
const chains = findChains(chaingraph);

// Build tool_id -> {CONST_NAME: valueText} once per tool, not once per chain.
const constsByTool = new Map();
function constantsFor(slug) {
  if (constsByTool.has(slug)) return constsByTool.get(slug);
  const p = join(REPO, 'tools', slug, 'index.html');
  const c = existsSync(p) ? extractConstants(readFileSync(p, 'utf8')) : {};
  constsByTool.set(slug, c);
  return c;
}

let hits = 0, sharedConstTools = new Set(), coLocatingChains = 0;
for (const chain of chains) {
  const slugs = chain.nodes.map(al => alToSlug.get(al)).filter(Boolean);
  // name -> [{slug, value}]
  const byName = new Map();
  for (const slug of slugs) {
    const c = constantsFor(slug);
    for (const [name, value] of Object.entries(c)) {
      sharedConstTools.add(slug);
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push({ slug, value });
    }
  }
  for (const [name, defs] of byName) {
    if (defs.length < 2) continue;
    coLocatingChains++;
    const distinct = new Set(defs.map(d => d.value.key));
    if (distinct.size > 1) {
      hits++;
      console.error(`✗ chain "${chain.id}" — ${name} disagrees:`);
      for (const d of defs) console.error(`    ${d.slug}: ${d.value.display}`);
    }
  }
}

if (hits) {
  console.error(`\n✗ chain-coherence-check: ${hits} constant-disagreement(s) across ${chains.length} chains. Fix before commit.`);
  process.exit(1);
}
console.log(`✓ chain-coherence-check: ${chains.length} chains checked, ${sharedConstTools.size} tools define a chain-visible constant, 0 disagreements.`);
process.exit(0);
