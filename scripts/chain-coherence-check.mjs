#!/usr/bin/env node
// chain-coherence-check.mjs — CHAIN-COHERENCE GATE (G3, AL-CI-HASHDOMAIN / AL-G3-CHAINSHAPE).
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
// AL-G3-CHAINSHAPE fix: the original version of this gate walked the graph for any object
// carrying a string `nodes: [...]` array and called that a "chain". `chaingraph.json`'s 42
// real chains carry `chains[].steps[].tool_id`, not a top-level `nodes` array — the walker
// matched 0 of them and instead silently matched 38 unrelated `journeys[].themes[]
// .sub_journeys[]` entries (a persona-page navigation index, AL-id keyed), printing a green
// "38 chains checked" line that examined none of the 42 chains it exists to examine.
//
// Fix: walk BOTH real structures explicitly and report them separately so the count is
// reconcilable against the file by anyone who greps it:
//   - `chains[]`            (42) — the canonical hand-off chains. Steps carry `tool_id`,
//                                   which resolves directly against the top-level `nodes[]`
//                                   registry's own `tool_id` (covers showcase multi-stage
//                                   entries too — a `sc*-*` stage id resolves through its
//                                   node's `url` to the single tool file it's an anchor on).
//   - sub_journeys[]        (38) — the persona-page display index. Steps carry AL-ids,
//                                   resolved through the same `nodes[]` registry's `al_id`.
//                                   Kept in scope (not noise) because these ARE tool
//                                   sequences a reader sees rendered together on a
//                                   `chaingraph/*.html` persona page — the same
//                                   composite-inconsistency risk applies.
// A tool_id/AL-id that fails to resolve is reported and skipped, never silently dropped.
//
// Usage: node scripts/chain-coherence-check.mjs   (exit 1 on any hit)
// Env (test-only override): ROOT=<absolute base dir> — chaingraph.json is read from
//   ROOT/chaingraph/chaingraph.json and tool files resolve under ROOT/tools|showcase/...;
//   defaults to the real repo tree.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.ROOT ? resolve(process.env.ROOT) : REPO;
const CHAINGRAPH_PATH = join(ROOT, 'chaingraph', 'chaingraph.json');

function loadJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }

// url -> repo-relative file path, e.g. "https://apexlogics.org/tools/25-x/" -> "tools/25-x/index.html"
// and "https://apexlogics.org/showcase/y/#render" -> "showcase/y/index.html" (anchor-only
// stage refs collapse onto the one file they're a stage of).
function urlToFile(url) {
  const m = /^https:\/\/apexlogics\.org\/((?:tools|showcase)\/[^#?]+?)\/?(?:[#?].*)?$/.exec(url);
  if (!m) return null;
  return join(m[1], 'index.html');
}

const chaingraph = loadJson(CHAINGRAPH_PATH);

// nodes[] is the one SSOT for "what tool_id / AL-id resolves to what file" — build both
// lookup directions off it once.
const nodes = Array.isArray(chaingraph.nodes) ? chaingraph.nodes : [];
const fileByToolId = new Map();
const fileByAlId = new Map();
for (const n of nodes) {
  const file = typeof n.url === 'string' ? urlToFile(n.url) : null;
  if (!file) continue;
  if (n.tool_id) fileByToolId.set(n.tool_id, file);
  if (n.al_id) fileByAlId.set(n.al_id, file);
}

// ── Structure 1: chains[].steps[].tool_id — the 42 canonical hand-off chains ──────────
const realChains = (Array.isArray(chaingraph.chains) ? chaingraph.chains : []).map(c => ({
  kind: 'chain', id: c.name || '(unnamed)',
  refs: (c.steps || []).map(s => s.tool_id).filter(Boolean),
}));

// ── Structure 2: journeys[...].sub_journeys[].nodes[] — the 38 persona-page sequences ─
function findSubJourneys(node) {
  const out = [];
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o && typeof o === 'object') {
      if (Array.isArray(o.nodes) && o.nodes.length && o.nodes.every(x => typeof x === 'string')) {
        out.push({ kind: 'sub_journey', id: o.id || o.label || '(unnamed)', refs: o.nodes });
      }
      for (const k of Object.keys(o)) walk(o[k]);
    }
  };
  walk(node);
  return out;
}
const subJourneys = findSubJourneys(chaingraph.journeys || []);

// ── Resolve every chain's refs to files, reporting (not silently dropping) misses ─────
let unresolved = 0;
function resolveEntry(entry) {
  const lookup = entry.kind === 'chain' ? fileByToolId : fileByAlId;
  const files = [];
  for (const ref of entry.refs) {
    const file = lookup.get(ref);
    if (!file) { unresolved++; console.error(`  ⚠ unresolved ${entry.kind} ref in "${entry.id}": ${ref}`); continue; }
    if (!existsSync(join(ROOT, file))) { unresolved++; console.error(`  ⚠ ${entry.kind} "${entry.id}" ref ${ref} -> ${file} (no such file)`); continue; }
    files.push(file);
  }
  return files;
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
const OBJ_PAIR_RE = /([\w$]+)\s*:\s*(-?\d+(?:\.\d+)?)/g;

// Object-shaped constants are compared PER SUBKEY, not by whole-object equality. Two tools
// legitimately scoping the same named constant to different subsets (e.g. one MBA tool's
// TIER_VALUE covers {m7,t15,t25}, another's covers {m7,t15,t25,t50} because its own UI
// offers a t50 option the other tool's never does) are not in disagreement — every key
// they BOTH define agrees. Only a key both define with different values is a real finding;
// a key only one of them defines is a scope difference, not drift.
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
    if (raw.startsWith('{')) {
      if (!ALL_NUMERIC_OBJECT.test(raw.replace(/\s+/g, ''))) continue; // has a non-numeric value — not a tax-constant-shaped table
      const pairs = {};
      let pm;
      OBJ_PAIR_RE.lastIndex = 0;
      while ((pm = OBJ_PAIR_RE.exec(raw))) pairs[pm[1]] = pm[2];
      out[m[1]] = { shape: 'object', pairs, display: raw.replace(/\s+/g, ' ').trim() };
    } else {
      out[m[1]] = { shape: 'scalar', value: raw, display: raw };
    }
  }
  return out;
}

const constsByFile = new Map();
function constantsFor(file) {
  if (constsByFile.has(file)) return constsByFile.get(file);
  const p = join(ROOT, file);
  const c = existsSync(p) ? extractConstants(readFileSync(p, 'utf8')) : {};
  constsByFile.set(file, c);
  return c;
}

let hits = 0, sharedConstFiles = new Set(), coLocations = 0;
function checkGroup(entries) {
  for (const entry of entries) {
    const files = resolveEntry(entry);
    const byName = new Map();
    for (const file of files) {
      const c = constantsFor(file);
      for (const [name, value] of Object.entries(c)) {
        sharedConstFiles.add(file);
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push({ file, value });
      }
    }
    for (const [name, defs] of byName) {
      if (defs.length < 2) continue;
      coLocations++;
      if (defs[0].value.shape === 'scalar') {
        const distinct = new Set(defs.map(d => d.value.value));
        if (distinct.size > 1) {
          hits++;
          console.error(`✗ ${entry.kind} "${entry.id}" — ${name} disagrees:`);
          for (const d of defs) console.error(`    ${d.file}: ${d.value.display}`);
        }
        continue;
      }
      // object shape: compare per subkey — a key only some defs carry is a scope
      // difference, not drift; a key >=2 defs share with different values is a real hit.
      const byKey = new Map();
      for (const d of defs) {
        for (const [k, v] of Object.entries(d.value.pairs)) {
          if (!byKey.has(k)) byKey.set(k, []);
          byKey.get(k).push({ file: d.file, v });
        }
      }
      const disagreeingKeys = [];
      for (const [k, vs] of byKey) {
        if (new Set(vs.map(x => x.v)).size > 1) disagreeingKeys.push([k, vs]);
      }
      if (disagreeingKeys.length) {
        hits++;
        console.error(`✗ ${entry.kind} "${entry.id}" — ${name} disagrees on shared key(s):`);
        for (const [k, vs] of disagreeingKeys) {
          console.error(`    ${k}:`);
          for (const v of vs) console.error(`      ${v.file}: ${v.v}`);
        }
      }
    }
  }
}
checkGroup(realChains);
checkGroup(subJourneys);

if (unresolved) {
  console.error(`\n✗ chain-coherence-check: ${unresolved} unresolved ref(s) (reported above) — a dead tool_id/AL-id in chains[].steps[] or journeys[].sub_journeys[].nodes[] is a hard error, not a warning. Fix before commit.`);
  process.exit(1);
}
if (hits) {
  console.error(`\n✗ chain-coherence-check: ${hits} constant-disagreement(s) across ${realChains.length} chains + ${subJourneys.length} sub-journeys (${coLocations} co-locations checked). Fix before commit.`);
  process.exit(1);
}
console.log(`✓ chain-coherence-check: ${realChains.length} chains + ${subJourneys.length} sub-journeys walked (chains[].steps[].tool_id + journeys[].sub_journeys[].nodes[], both resolved via nodes[] registry), ${sharedConstFiles.size} tool files define a chain-visible constant, ${coLocations} co-location(s) checked, 0 disagreements, 0 unresolved refs.`);
process.exit(0);
