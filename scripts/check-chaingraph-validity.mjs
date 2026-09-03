#!/usr/bin/env node
/**
 * scripts/check-chaingraph-validity.mjs — chaingraph.json referential-integrity
 * gate (AL-CG-VALIDITY).
 *
 * check-chaingraph-parity.mjs proves the site copy and worker copy agree with
 * EACH OTHER; it never checks either copy against reality. That let 3 dead
 * chain-step tool_ids (sc1-art-render, sc2-arg-final-reveal, sc2-arg-stage-two
 * — no registry row, no disk dir) and an orphaned persona (`creator`, absent
 * from the personas[]/journeys[] lists) sit blessed in both copies
 * (ESTATE-AUDIT-2026-09-03.md §P1-2). This gate checks the SITE copy
 * (repo/chaingraph/chaingraph.json, canonical) against ground truth:
 *
 *   1. every chain step's tool_id resolves in the registry universe
 *      (suite-registry.json tools[].tool_id ∪ .slug ∪ .al_id — 54/168 rows
 *      were null-tool_id/slug-only at audit time (P1-5), so tool_id-only
 *      keying silently misses real tools. Composite al_ids like "AL-06+16"
 *      are matched whole — NEVER split on "+").
 *   2. every node's url resolves to a directory on disk (fragment stripped).
 *   3. every chain's persona is a member of personas[].
 *
 * Blocking, no baseline, no exception list.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const CHAINGRAPH_PATH = join(ROOT, 'chaingraph', 'chaingraph.json');
const REGISTRY_PATH = join(ROOT, 'suite-registry.json');

export function loadRegistryUniverse(registryPath = REGISTRY_PATH) {
  const raw = readFileSync(registryPath, 'utf8').replace(/\x00+$/, '');
  const reg = JSON.parse(raw);
  const universe = new Set();
  for (const t of reg.tools ?? []) {
    if (t.tool_id) universe.add(t.tool_id);
    if (t.slug) universe.add(t.slug);
    if (t.al_id) universe.add(t.al_id); // whole value — never split composite "AL-06+16"
  }
  return universe;
}

// A node's url is https://apexlogics.org/<tools|showcase>/<slug>/[#fragment] —
// strip host + fragment, keep the path, check the directory exists on disk.
export function urlToDiskPath(url, root = ROOT) {
  let path;
  try {
    const u = new URL(url);
    path = u.pathname;
  } catch {
    return null;
  }
  path = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!path) return null;
  return join(root, path);
}

export function checkChaingraphValidity({
  chaingraphPath = CHAINGRAPH_PATH,
  registryPath = REGISTRY_PATH,
  root = ROOT,
} = {}) {
  const doc = JSON.parse(readFileSync(chaingraphPath, 'utf8'));
  const universe = loadRegistryUniverse(registryPath);
  const personas = new Set(doc.personas ?? []);
  const failures = [];
  const oks = [];

  // 1. chain step tool_ids ∈ registry universe
  let stepCount = 0;
  for (const chain of doc.chains ?? []) {
    for (const step of chain.steps ?? []) {
      stepCount++;
      if (!universe.has(step.tool_id)) {
        failures.push(`chain "${chain.name}" step tool_id "${step.tool_id}" not in registry universe (tool_id/slug/al_id)`);
      }
      const nextIds = (step.gate?.rules ?? []).map(r => r.next).filter(n => n && n !== 'end');
      if (step.gate?.default && step.gate.default !== 'end') nextIds.push(step.gate.default);
      for (const nextId of nextIds) {
        if (!universe.has(nextId)) {
          failures.push(`chain "${chain.name}" gate target "${nextId}" not in registry universe (tool_id/slug/al_id)`);
        }
      }
    }
  }
  if (failures.length === 0) oks.push(`${stepCount} chain steps (across ${(doc.chains ?? []).length} chains) all resolve in the registry universe`);

  // 2. node urls resolve on disk
  let nodeCount = 0;
  let nodeFailBefore = failures.length;
  for (const node of doc.nodes ?? []) {
    nodeCount++;
    const diskPath = urlToDiskPath(node.url, root);
    if (!diskPath || !existsSync(diskPath)) {
      failures.push(`node "${node.tool_id}" url "${node.url}" does not resolve to a directory on disk`);
    }
  }
  if (failures.length === nodeFailBefore) oks.push(`${nodeCount} node urls all resolve to directories on disk`);

  // 3. chain personas ∈ personas[]
  let personaFailBefore = failures.length;
  const chainNames = doc.chains ?? [];
  for (const chain of chainNames) {
    if (chain.persona && !personas.has(chain.persona)) {
      failures.push(`chain "${chain.name}" persona "${chain.persona}" not in personas[] (${[...personas].join(', ')})`);
    }
  }
  if (failures.length === personaFailBefore) oks.push(`${chainNames.length} chain personas all in personas[]`);

  return { failures, oks };
}

function main() {
  const { failures, oks } = checkChaingraphValidity();
  for (const msg of oks) console.log(`OK    ${msg}`);
  for (const msg of failures) console.log(`FAIL  ${msg}`);

  if (failures.length) {
    console.error(`\ncheck-chaingraph-validity: ${failures.length} referential-integrity failure(s) in chaingraph/chaingraph.json.`);
    process.exit(1);
  }
  console.log('\ncheck-chaingraph-validity: OK — all chain-step tool_ids, node urls, and chain personas check out.');
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) main();
