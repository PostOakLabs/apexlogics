#!/usr/bin/env node
// hash-freeze.mjs — TOOL-LEVEL HASH-FREEZE GATE (repo/ CI preflight — S-D2, apex analog).
//
// Freezes the execution_hash of every golden artifact fixture: recomputes it from the
// fixture's OWN {policy_parameters, output_payload} using the VENDORED SSOT canonicalizer
// (chaingraph/kernels/_hash.mjs → executionHash) and fails if it doesn't match the committed
// value. schema-validate only checks that execution_hash is *shaped* like a digest (64 hex);
// this proves it's the *correct* digest and hasn't drifted.
//
// Why this is the apex form of linear-hash-freeze: the canonical AINumbers gate freezes each
// linear chain's composite_execution_hash from runChain(). ApexLogics has no run_chain / kernel
// registry / embed yet (those are D1), so there is no composite hash to snapshot pre-D1. What
// run_chain WILL consume as node hashes are exactly these per-tool artifact execution_hashes —
// so freezing them now is the meaningful pre-D1 snapshot. The chain-level composite freeze
// folds into D1 (capture as D1's first commit, before any gate-adding semantic change), same
// as B2/§17.
//
// Usage: node scripts/hash-freeze.mjs   (exit 1 on any moved/invalid hash)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executionHash } from '../chaingraph/kernels/_hash.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(REPO, 'chaingraph', 'kernels', 'fixtures');

if (!existsSync(DIR)) { console.error(`✗ no fixtures dir at ${DIR}`); process.exit(1); }
const goldens = readdirSync(DIR).filter((f) => f.endsWith('.golden.json'));
if (goldens.length === 0) { console.error('✗ no golden fixtures to freeze'); process.exit(1); }

let failed = 0;
for (const f of goldens) {
  const g = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  if (!g.execution_hash || !g.policy_parameters || !g.output_payload) {
    console.error(`✗ ${f}: missing execution_hash / policy_parameters / output_payload`); failed++; continue;
  }
  let recomputed;
  try { recomputed = await executionHash(g.policy_parameters, g.output_payload); }
  catch (e) { console.error(`✗ ${f}: recompute threw — ${e.message}`); failed++; continue; }
  const claimed = g.execution_hash.replace(/^sha256:/, ''); // tolerate legacy prefix on the claim
  if (recomputed !== claimed) {
    console.error(`✗ ${f}: execution_hash MOVED\n    frozen:      ${claimed}\n    recomputed:  ${recomputed}`);
    failed++;
  } else {
    console.log(`✓ ${f}: ${claimed.slice(0, 16)}… frozen`);
  }
}

if (failed) { console.error(`\n✗ HASH-FREEZE: ${failed} of ${goldens.length} golden hash(es) moved/invalid.`); process.exit(1); }
console.log(`\n✓ HASH-FREEZE: all ${goldens.length} golden execution_hash values recompute exactly (SSOT canon).`);
process.exit(0);
