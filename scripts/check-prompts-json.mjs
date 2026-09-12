#!/usr/bin/env node
/**
 * scripts/check-prompts-json.mjs — showcase-prompts.json reference gate (AL-PROMPTS-JSON).
 *
 * mcp/showcase-prompts.json is the machine-readable SSOT for the 31 example prompts
 * (AL-EXAMPLE-PROMPTS-MASTER-2026-09-09.md). Downstream consumers (AL-PROMPTS-PAGE's
 * prompts.html and AL-PROMPTS-MCP's worker prompts/list) render and serve it as-is, so a
 * prompt that cites a tool the registry doesn't know, or a chain chaingraph.json doesn't
 * define, would ship a dead reference to every surface at once — exactly the dangling-ref
 * class AL-CG-VALIDITY caught for chaingraph.json itself.
 *
 * This gate:
 *   1. Parses the file and asserts the ratified count: 31 prompts, 7 groups with exact
 *      per-group counts (4 showcase / 4 persona / 6 everyday / 5 students / 5 career /
 *      4 institutions / 3 agentic).
 *   2. Asserts every required field is present and non-empty, ids are unique slugs, and
 *      doorway letters stay inside the published legend.
 *   3. Asserts the honesty scope mechanically: top-level honesty_scope carries "17 of 31",
 *      and any prompt claiming the Z doorway names Groth16 AND keeps the "not zk-proven"
 *      distinction in its body (SO 11 / the SSOT's standing caveat).
 *   4. Resolves every tools[] entry against the registry (slug or tool_id union),
 *      .well-known/mcp.json's worker tool names, and chaingraph.json chain names.
 *      anchor_hash is the one external by design: the shared AINumbers anchor MCP
 *      (STANDING-ORDERS SO 12 — Apex never owns a TSA).
 *
 * Usage: node scripts/check-prompts-json.mjs
 * Exit 0 = all references resolve. Exit 1 = drift (all classes reported, named).
 */
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const EXPECTED_COUNT = 31;
const EXPECTED_GROUP_COUNTS = {
  showcase: 4,
  persona: 4,
  everyday: 6,
  students: 5,
  career: 5,
  institutions: 4,
  agentic: 3,
};
const DOORWAY_LETTERS = ['P', 'R', 'K', 'Z', 'G', 'W', 'A'];
// Shared AINumbers anchor MCP — external infrastructure by design (SO 12), so it can
// never appear in suite-registry.json or the worker's tool list.
const EXTERNAL_SURFACES = new Set(['anchor_hash']);
const REQUIRED_STRINGS = ['id', 'title', 'one_line', 'body', 'verify_surface', 'group'];
const REQUIRED_ARRAYS = ['doorways', 'arguments', 'requires', 'tools'];

export function checkPromptsJson() {
  const errors = [];

  let doc;
  try {
    const raw = readFileSync(join(ROOT, 'mcp', 'showcase-prompts.json'), 'utf8').replace(/\x00+$/, '');
    doc = JSON.parse(raw);
  } catch (e) {
    return [`PARSE  mcp/showcase-prompts.json does not parse: ${e.message}`];
  }

  const prompts = doc.prompts;
  if (!Array.isArray(prompts)) {
    return ['PARSE  mcp/showcase-prompts.json has no top-level prompts[] array'];
  }

  if (prompts.length !== EXPECTED_COUNT) {
    errors.push(`COUNT  showcase-prompts.json has ${prompts.length} prompts, expected ${EXPECTED_COUNT} (AL-EXAMPLE-PROMPTS-MASTER-2026-09-09.md)`);
  }
  if (doc.count !== prompts.length) {
    errors.push(`COUNT  top-level count field (${doc.count}) disagrees with prompts[] length (${prompts.length})`);
  }

  const groupCounts = {};
  const seenIds = new Set();
  for (const p of prompts) {
    const where = `prompt[${p.id ?? JSON.stringify(p).slice(0, 40)}]`;

    for (const f of REQUIRED_STRINGS) {
      if (typeof p[f] !== 'string' || !p[f].trim()) {
        errors.push(`FIELD  ${where} required field "${f}" is missing or empty`);
      }
    }
    for (const f of REQUIRED_ARRAYS) {
      if (!Array.isArray(p[f])) {
        errors.push(`FIELD  ${where} required field "${f}" is missing or not an array`);
      }
    }
    if (typeof p.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) {
      errors.push(`FIELD  ${where} id is not a slug (lowercase, digits, single hyphens)`);
    } else if (seenIds.has(p.id)) {
      errors.push(`DUPLICATE  prompt id "${p.id}" appears more than once`);
    }
    if (p.id) seenIds.add(p.id);

    groupCounts[p.group] = (groupCounts[p.group] ?? 0) + 1;

    if (!Array.isArray(p.doorways) || p.doorways.some(d => !DOORWAY_LETTERS.includes(d))) {
      errors.push(`DOORWAY  ${where} doorways ${JSON.stringify(p.doorways)} leave the legend ${DOORWAY_LETTERS.join('')}`);
    }
    if (!Array.isArray(p.requires) || p.requires.some(d => !DOORWAY_LETTERS.includes(d))) {
      errors.push(`DOORWAY  ${where} requires ${JSON.stringify(p.requires)} leave the legend ${DOORWAY_LETTERS.join('')}`);
    }
    if (Array.isArray(p.doorways) && Array.isArray(p.requires)) {
      const unclaimed = p.doorways.filter(d => !p.requires.includes(d));
      if (unclaimed.length) {
        errors.push(`DOORWAY  ${where} doorways ${unclaimed.join('')} not backed by the requires field`);
      }
    }

    if (Array.isArray(p.requires) && p.requires.includes('Z')) {
      if (typeof p.body !== 'string' || !p.body.includes('Groth16') || !p.body.includes('not zk-proven')) {
        errors.push(`HONESTY  ${where} claims the Z doorway but the body never pairs Groth16 with the "hash-verifiable, not zk-proven" distinction`);
      }
    }
  }

  if (typeof doc.honesty_scope !== 'string' || !doc.honesty_scope.includes('17 of 31')) {
    errors.push('HONESTY  top-level honesty_scope must state the "17 of 31" proven-kernel scope');
  }

  for (const [group, expected] of Object.entries(EXPECTED_GROUP_COUNTS)) {
    if ((groupCounts[group] ?? 0) !== expected) {
      errors.push(`GROUP  group "${group}" has ${groupCounts[group] ?? 0} prompts, expected ${expected}`);
    }
  }
  for (const group of Object.keys(groupCounts)) {
    if (!(group in EXPECTED_GROUP_COUNTS)) {
      errors.push(`GROUP  unknown group "${group}" (expected one of ${Object.keys(EXPECTED_GROUP_COUNTS).join(', ')})`);
    }
  }

  // Resolve every tools[] entry: registry slug/tool_id, worker tool name, or chain name.
  const registry = JSON.parse(readFileSync(join(ROOT, 'suite-registry.json'), 'utf8').replace(/\x00+$/, ''));
  const resolvable = new Set();
  for (const t of registry.tools) {
    if (t.slug) resolvable.add(t.slug);
    if (t.tool_id) resolvable.add(t.tool_id);
  }
  const worker = JSON.parse(readFileSync(join(ROOT, '.well-known', 'mcp.json'), 'utf8'));
  for (const name of worker.mcp_server?.tools ?? []) resolvable.add(name);
  const chaingraph = JSON.parse(readFileSync(join(ROOT, 'chaingraph', 'chaingraph.json'), 'utf8').replace(/\x00+$/, ''));
  for (const c of chaingraph.chains) resolvable.add(c.name);

  for (const p of prompts) {
    if (!Array.isArray(p.tools)) continue;
    for (const ref of p.tools) {
      if (resolvable.has(ref) || EXTERNAL_SURFACES.has(ref)) continue;
      errors.push(`UNRESOLVED  prompt "${p.id}" cites tools[] entry "${ref}": not a registry slug/tool_id, not a worker tool name (.well-known/mcp.json), not a chaingraph chain name`);
    }
  }

  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = checkPromptsJson();
  if (errors.length) {
    errors.forEach(e => console.error(e));
    console.error(`FAIL — ${errors.length} showcase-prompts.json issue(s)`);
    process.exit(1);
  }
  console.log(`OK — showcase-prompts.json: ${EXPECTED_COUNT} prompts, all doorways/tools/chain refs resolve, honesty scope intact`);
}
