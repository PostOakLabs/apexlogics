#!/usr/bin/env node
/**
 * scripts/check-registry-self.mjs — suite-registry.json self-validation gate (AL-REGSELF).
 *
 * verify-counts.mjs never loads suite-registry.json — it only checks
 * .well-known/mcp.json. This gate asserts the registry's own scalar fields
 * agree with its own tools[] array, so denormalized counts can't rot again
 * unnoticed (found 2026-08-29: showcase_count/tool_count/tools_count_total/
 * registry_version/last_updated had all drifted from reality).
 *
 * Blocking, no baseline, no exception list.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const raw = readFileSync(join(ROOT, 'suite-registry.json'), 'utf8').replace(/\x00+$/, '');
const reg = JSON.parse(raw);
const mcp = JSON.parse(readFileSync(join(ROOT, '.well-known', 'mcp.json'), 'utf8'));

// The live CONTRACT (apexlogics_CONTRACT.md) is internal-only, never pushed to this
// repo — CI cannot read it directly. This constant is the hand-maintained mirror of
// its header version (`# ... Unified Build Contract vX.Y.Z`), bumped by whoever lands
// the CONTRACT amendment, same discipline as repo/CLAUDE.md's own hand-typed CONTRACT
// line (AL-REG-FRESH, 2026-09-03).
const EXPECTED_CONTRACT_VERSION = '1.12.0';

let failures = 0;
const fail = msg => { console.log(`FAIL  ${msg}`); failures++; };
const ok = msg => console.log(`OK    ${msg}`);

const tools = reg.tools;
const shipped = tools.filter(t => t.status === 'shipped').length;
const showcase = tools.filter(t => t.status === 'showcase').length;

// ── 1. derived-vs-declared counts ────────────────────────────────────────
for (const key of ['tools_count_total_active', 'tools_count_shipped', 'tools_count_live']) {
  if (reg[key] === shipped) ok(`${key} === ${shipped}`);
  else fail(`${key}=${reg[key]} but derived shipped count=${shipped}`);
}
if (reg.showcase_count === showcase) ok(`showcase_count === ${showcase}`);
else fail(`showcase_count=${reg.showcase_count} but derived showcase count=${showcase}`);

if ('tool_count' in reg || 'tools_count_total' in reg) {
  fail('redundant tool_count/tools_count_total fields present — delete, do not reintroduce');
} else {
  ok('no redundant tool_count/tools_count_total fields');
}

// ── 2. version parity ────────────────────────────────────────────────────
if (reg.version === reg.registry_version) ok(`version === registry_version (${reg.version})`);
else fail(`version=${reg.version} disagrees with registry_version=${reg.registry_version}`);

// ── 3. every url is absolute ─────────────────────────────────────────────
const BASE = 'https://apexlogics.org/';
const badUrl = tools.filter(t => !t.url || !t.url.startsWith(BASE));
if (badUrl.length === 0) ok(`all ${tools.length} tools[].url are absolute (${BASE}...)`);
else fail(`${badUrl.length} tools[] entries have missing/relative url: ${badUrl.slice(0, 5).map(t => t.al_id).join(', ')}${badUrl.length > 5 ? ', ...' : ''}`);

// ── 4. every tools[] entry resolves to a real path on disk ──────────────
const badPath = tools.filter(t => !t.file_path || !existsSync(join(ROOT, t.file_path)));
if (badPath.length === 0) ok(`all ${tools.length} tools[].file_path resolve on disk`);
else fail(`${badPath.length} tools[] entries have a missing/unresolvable file_path: ${badPath.slice(0, 5).map(t => t.al_id).join(', ')}${badPath.length > 5 ? ', ...' : ''}`);

// ── 5. contract_version parity — registry + mcp.json vs live CONTRACT header ─
if (reg.contract_version === EXPECTED_CONTRACT_VERSION) ok(`registry contract_version === live CONTRACT ${EXPECTED_CONTRACT_VERSION}`);
else fail(`registry contract_version=${reg.contract_version} disagrees with live CONTRACT ${EXPECTED_CONTRACT_VERSION}`);

if (mcp.contract_version === EXPECTED_CONTRACT_VERSION) ok(`mcp.json contract_version === live CONTRACT ${EXPECTED_CONTRACT_VERSION}`);
else fail(`mcp.json contract_version=${mcp.contract_version} disagrees with live CONTRACT ${EXPECTED_CONTRACT_VERSION}`);

// ── 6. tool_id non-null on every AL row (AL-53+ era shipped slug-only, 54/168 found 2026-09-03) ─
const nullToolId = tools.filter(t => (t.al_id || '').startsWith('AL-') && !t.tool_id);
if (nullToolId.length === 0) ok(`all ${tools.length} tools[] rows carry a non-null tool_id`);
else fail(`${nullToolId.length} AL rows have a null/missing tool_id: ${nullToolId.slice(0, 5).map(t => t.al_id).join(', ')}${nullToolId.length > 5 ? ', ...' : ''}`);

// ── 7. mcp.json last_updated not older than registry's ──────────────────────
if (mcp.last_updated >= reg.last_updated) ok(`mcp.json last_updated (${mcp.last_updated}) not older than registry (${reg.last_updated})`);
else fail(`mcp.json last_updated=${mcp.last_updated} is older than registry last_updated=${reg.last_updated}`);

// ── result ────────────────────────────────────────────────────────────────
if (failures === 0) {
  console.log('\nRegistry self-check passed.');
  process.exit(0);
} else {
  console.log(`\n${failures} registry self-check failure(s).`);
  process.exit(1);
}
