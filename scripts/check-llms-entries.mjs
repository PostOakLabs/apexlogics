#!/usr/bin/env node
/**
 * scripts/check-llms-entries.mjs — llms.txt entry-level drift gate (AL-LLMS-ENTRIES,
 * extended by AL-LLMS-GEN 2026-10-02).
 *
 * verify-counts.mjs asserts the header/summary text ("Tools: 168 shipped …") but never
 * counts the actual `### #N · AL-ID — Title` entry rows beneath it, so a tool could ship,
 * pass every other gate, and still be silently absent from the agent-facing index — which
 * is exactly what happened to AL-160 (found by ESTATE-AUDIT-2026-09-03 §P1-1: 167 entries
 * vs. 168 shipped, one AL-ID missing, header count untouched).
 *
 * This gate:
 *   1. Counts `^### #` lines in llms.txt and compares to `tools_count_shipped` derived
 *      from suite-registry.json (via counts.mjs's `tools` figure).
 *   2. Extracts the AL-ID out of every entry heading and diffs that set against every
 *      shipped AL-ID in the registry — reports missing (in registry, not in llms.txt)
 *      and extra (in llms.txt, not in registry) by name.
 *   3. AL-LLMS-GEN §1 — TITLE-PARITY: every `### #N · AL-ID — Title` heading (and every
 *      `### SC-NN — Title` showcase heading) must carry the registry's title for that
 *      ID verbatim. The registry is the SSOT; llms.txt is rendered from it by
 *      scripts/gen-llms.mjs, so any divergence here is drift (hand edit, or a registry
 *      title bump that never regenerated).
 *   4. AL-LLMS-GEN §1 — VERSION-HEADER: the `# Suite version: registry v… · spec … ·
 *      contract …` header must equal suite-registry.json's version / spec_version /
 *      contract_version. A stale version header here lied to agents across whole
 *      registry waves (v5.6.7 sat on the file while the registry reached v5.13.0).
 *   5. AL-LLMS-GEN §1 — CONTRACT-PARITY: the contract version the header declares must
 *      also equal `.well-known/mcp.json`'s contract_version, and the registry's
 *      contract_version must equal it too (three surfaces, one number).
 *
 * WARN-only (never a failure in this row): the "OpenChainGraph Standard v…" sentence in
 * the OpenChainGraph prose block vs. chaingraph/chaingraph.json's spec_version. The graph
 * value itself is stale and AL-CG-COVERAGE bumps it; until that lands, a mismatch here
 * prints one WARN line to stderr and does not fail the build.
 *
 * Usage: node scripts/check-llms-entries.mjs
 * Exit 0 = counts, AL-ID sets, titles, version header and contract agree.
 * Exit 1 = drift (all classes reported, named).
 */
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { deriveCounts } from './counts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// AL-ID may be a composite like "AL-06+16" (two AL-IDs combined into one shipped
// tool before either had an individual slug) — do NOT split on "+", per
// ESTATE-AUDIT-2026-09-03 §P1-2's standing note on this exact class of ID.
const ENTRY_RE = /^### #\S+ · (AL-[\d+]+) —/gm;
const TITLE_RE = /^### #\S+ · (AL-[\d+]+) — (.+)$/gm;
const SC_TITLE_RE = /^### (SC-\d+) — (.+)$/gm;
const VERSION_HEADER_RE = /^# Suite version: registry v(\S+) · spec (\S+) · contract (\S+)\s*$/m;
const OCG_VERSION_RE = /OpenChainGraph Standard v([\d.]+)/;

export function checkLlmsEntries() {
  const llms = readFileSync(join(ROOT, 'llms.txt'), 'utf8');
  const raw = readFileSync(join(ROOT, 'suite-registry.json'), 'utf8').replace(/\x00+$/, '');
  const registry = JSON.parse(raw);
  const byId = new Map(registry.tools.map(t => [t.al_id, t]));

  const shippedIds = new Set(
    registry.tools.filter(t => t.category !== 'showcase').map(t => t.al_id)
  );

  const entryIds = [];
  let m;
  ENTRY_RE.lastIndex = 0;
  while ((m = ENTRY_RE.exec(llms))) entryIds.push(m[1]);
  const entryIdSet = new Set(entryIds);

  const { tools: expectedCount } = deriveCounts();
  const errors = [];

  if (entryIds.length !== expectedCount) {
    errors.push(`ENTRY-COUNT  llms.txt has ${entryIds.length} "### #" entries, expected ${expectedCount} (suite-registry.json shipped tools)`);
  }

  const dupes = entryIds.filter((id, i) => entryIds.indexOf(id) !== i);
  if (dupes.length) {
    errors.push(`DUPLICATE-ENTRY  AL-ID(s) appear more than once in llms.txt: ${[...new Set(dupes)].join(', ')}`);
  }

  const missing = [...shippedIds].filter(id => !entryIdSet.has(id)).sort();
  if (missing.length) {
    errors.push(`MISSING-ENTRY  shipped AL-ID(s) absent from llms.txt: ${missing.join(', ')}`);
  }

  const extra = [...entryIdSet].filter(id => !shippedIds.has(id)).sort();
  if (extra.length) {
    errors.push(`EXTRA-ENTRY  llms.txt AL-ID(s) not in shipped registry: ${extra.join(', ')}`);
  }

  // ── 3. TITLE-PARITY (AL-LLMS-GEN): every entry heading carries the registry title ──
  const titleDrift = [];
  TITLE_RE.lastIndex = 0;
  while ((m = TITLE_RE.exec(llms))) {
    const t = byId.get(m[1]);
    if (t && t.title !== m[2]) {
      titleDrift.push(`${m[1]}: llms.txt "${m[2]}" vs registry "${t.title}"`);
    }
  }
  SC_TITLE_RE.lastIndex = 0;
  while ((m = SC_TITLE_RE.exec(llms))) {
    const t = byId.get(m[1]);
    if (t && t.title !== m[2]) {
      titleDrift.push(`${m[1]}: llms.txt "${m[2]}" vs registry "${t.title}"`);
    }
  }
  if (titleDrift.length) {
    errors.push(`TITLE-DRIFT  entry heading title(s) differ from suite-registry.json (${titleDrift.length}): ${titleDrift.join(' | ')}`);
  }

  // ── 4. VERSION-HEADER (AL-LLMS-GEN): header line equals registry v/spec/contract ──
  const vh = llms.match(VERSION_HEADER_RE);
  if (!vh) {
    errors.push(`VERSION-HEADER  "# Suite version: registry v… · spec … · contract …" line missing or unparseable in llms.txt`);
  } else {
    // Each segment on the line carries a literal "v" prefix ("spec v10.9"); the
    // registry stores bare numbers ("10.9"). Strip it before comparing.
    const stripV = s => s.replace(/^v/, '');
    const [vReg, vSpec, vContract] = vh.slice(1).map(stripV);
    const want = [String(registry.version).replace(/^v/, ''), String(registry.spec_version), String(registry.contract_version)];
    if (vReg !== want[0] || vSpec !== want[1] || vContract !== want[2]) {
      errors.push(`VERSION-HEADER  llms.txt says "registry v${vReg} · spec v${vSpec} · contract v${vContract}", suite-registry.json says v${want[0]} · spec ${want[1]} · contract ${want[2]}`);
    }
    // ── 5. CONTRACT-PARITY: llms.txt ↔ registry ↔ .well-known/mcp.json agree ──
    let mcpContract;
    try {
      mcpContract = String(JSON.parse(readFileSync(join(ROOT, '.well-known', 'mcp.json'), 'utf8')).contract_version);
    } catch (e) {
      errors.push(`CONTRACT-PARITY  cannot read .well-known/mcp.json contract_version: ${e.message}`);
    }
    if (mcpContract !== undefined) {
      if (vContract !== mcpContract) {
        errors.push(`CONTRACT-PARITY  llms.txt contract v${vContract} != .well-known/mcp.json contract_version ${mcpContract}`);
      }
      if (String(registry.contract_version) !== mcpContract) {
        errors.push(`CONTRACT-PARITY  suite-registry.json contract_version ${registry.contract_version} != .well-known/mcp.json contract_version ${mcpContract}`);
      }
    }
  }

  return errors;
}

function warnOcgraphVersion() {
  // WARN-only until AL-CG-COVERAGE bumps chaingraph.json's stale spec_version.
  try {
    const llms = readFileSync(join(ROOT, 'llms.txt'), 'utf8');
    const graph = JSON.parse(readFileSync(join(ROOT, 'chaingraph', 'chaingraph.json'), 'utf8'));
    const m = llms.match(OCG_VERSION_RE);
    if (!m) { console.error('WARN  llms.txt carries no "OpenChainGraph Standard v…" sentence to compare against chaingraph.json'); return; }
    if (m[1] !== String(graph.spec_version)) {
      console.error(`WARN (non-blocking until AL-CG-COVERAGE lands)  llms.txt claims OpenChainGraph Standard v${m[1]}, chaingraph/chaingraph.json spec_version is ${graph.spec_version} — the graph value is the stale side; that row bumps it`);
    }
  } catch (e) {
    console.error(`WARN  could not compare OpenChainGraph version lines: ${e.message}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = checkLlmsEntries();
  warnOcgraphVersion();
  if (errors.length) {
    errors.forEach(e => console.error(e));
    console.error(`FAIL — ${errors.length} llms.txt entry drift issue(s)`);
    process.exit(1);
  }
  console.log('OK — llms.txt entries match shipped registry AL-IDs 1:1, titles match, version header and contract parity hold');
}
