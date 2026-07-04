#!/usr/bin/env node
// check-vendor-fresh.mjs — VENDOR-FRESHNESS GATE (repo/ CI preflight).
//
// Enforces that the two files ApexLogics vendors from the OpenChainGraph SSOT stay
// byte-identical to the SSOT source. Drift here is the exact class of bug that shipped
// once already (a STALE pre-v0.6 schema silently passed every farmed validation — see
// CHAINGRAPH-ADOPTION.md bug #2). This gate closes it.
//
// Covered (per ORCHESTRATION §4 — "check-vendor-fresh must cover schema + _hash.mjs"):
//   1. chaingraph/kernels/_hash.mjs        — the canonical JCS+SHA-256 canonicalizer.
//      The vendored copy legitimately carries a 3-line provenance banner ABOVE the SSOT
//      body (seeded at vendor time), so we compare the BODY (banner stripped), not the
//      whole file. Body must equal the SSOT source byte-for-byte (CRLF-normalized).
//   2. chaingraph/standard/openchain-graph-v0.4.schema.json — the frozen v0.4 schema
//      every artifact validates against. Vendored verbatim, no banner.
//
// Two modes:
//   * PINNED (default, CI): compares each file's CRLF-normalized SHA-256 to a pinned
//     expected value below. No SSOT checkout needed. Re-vendoring = deliberately update
//     the pin (a visible, reviewable diff).
//   * BYTE-COMPARE (local dev): set SITE_REPO to a checked-out AINumbers/repo and the gate
//     ALSO diffs the vendored files against the live SSOT — so if the SSOT itself advances,
//     you find out here and update the pin in the same commit.
//
// Usage:  node scripts/check-vendor-fresh.mjs
//         SITE_REPO="C:/dev/Claude/Projects/AINumbers/repo" node scripts/check-vendor-fresh.mjs
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const norm = (s) => s.replace(/\r\n/g, '\n');
const sha = (s) => createHash('sha256').update(s).digest('hex');

// Strip the leading vendored-provenance banner from _hash.mjs so we compare the SSOT body.
// Only removes leading comment lines whose text is the known banner (won't eat real code).
const stripBanner = (s) => norm(s).replace(
  /^(?:\/\/ VENDORED[^\n]*\n|\/\/ SSOT is read-only[^\n]*\n|\/\/ Vendored [^\n]*\n)+/,
  ''
);

// ── PINNED expected SSOT hashes (CRLF-normalized) ─────────────────────────────
// _hash.mjs: SHA-256 of the SSOT BODY (banner excluded). Source of record:
//   AINumbers/repo/chaingraph/kernels/_hash.mjs
// schema:    SHA-256 of the whole file. Source of record:
//   AINumbers/repo/chaingraph/standard/openchain-graph-v0.4.schema.json
const PIN = {
  hashBody: '9d60ba8b9a14900b9cc1f4878de4e92f5d8e622a128413840be9ea94bbae1cfb',
  schema:   'a30d57da0d4bf652144b37b4ae93bafc9f06fc6aa1dd0097bb65c6eea194a0e6',
};

const FILES = {
  hash:   join(REPO, 'chaingraph', 'kernels', '_hash.mjs'),
  schema: join(REPO, 'chaingraph', 'standard', 'openchain-graph-v0.4.schema.json'),
};

let fails = 0;

// 1) _hash.mjs body
{
  if (!existsSync(FILES.hash)) { console.error('✗ missing vendored file: chaingraph/kernels/_hash.mjs'); fails++; }
  else {
    const bodySha = sha(stripBanner(readFileSync(FILES.hash, 'utf8')));
    if (bodySha !== PIN.hashBody) {
      console.error(`✗ _hash.mjs body drifted from pinned SSOT sha`);
      console.error(`    expected ${PIN.hashBody}`);
      console.error(`    actual   ${bodySha}`);
      fails++;
    } else console.log('✓ chaingraph/kernels/_hash.mjs body matches pinned SSOT sha');
  }
}

// 2) schema
{
  if (!existsSync(FILES.schema)) { console.error('✗ missing vendored file: chaingraph/standard/openchain-graph-v0.4.schema.json'); fails++; }
  else {
    const schemaSha = sha(norm(readFileSync(FILES.schema, 'utf8')));
    if (schemaSha !== PIN.schema) {
      console.error(`✗ openchain-graph-v0.4.schema.json drifted from pinned SSOT sha`);
      console.error(`    expected ${PIN.schema}`);
      console.error(`    actual   ${schemaSha}`);
      fails++;
    } else console.log('✓ chaingraph/standard/openchain-graph-v0.4.schema.json matches pinned SSOT sha');
  }
}

// 3) OPTIONAL byte-compare vs a live SSOT checkout (local dev only)
const SITE = process.env.SITE_REPO;
if (SITE && existsSync(SITE)) {
  console.log(`\n(byte-comparing vs live SSOT: ${SITE})`);
  const ssotHash = join(SITE, 'chaingraph', 'kernels', '_hash.mjs');
  const ssotSchema = join(SITE, 'chaingraph', 'standard', 'openchain-graph-v0.4.schema.json');
  if (existsSync(ssotHash)) {
    const ssotBodySha = sha(norm(readFileSync(ssotHash, 'utf8')));
    if (ssotBodySha !== PIN.hashBody) { console.error(`✗ SSOT _hash.mjs advanced (sha ${ssotBodySha}) — update PIN.hashBody + re-vendor.`); fails++; }
    else console.log('✓ live SSOT _hash.mjs still equals PIN.hashBody');
  } else console.error(`  ! SSOT _hash.mjs not found at ${ssotHash}`);
  if (existsSync(ssotSchema)) {
    const ssotSchemaSha = sha(norm(readFileSync(ssotSchema, 'utf8')));
    if (ssotSchemaSha !== PIN.schema) { console.error(`✗ SSOT schema advanced (sha ${ssotSchemaSha}) — update PIN.schema + re-vendor.`); fails++; }
    else console.log('✓ live SSOT schema still equals PIN.schema');
  } else console.error(`  ! SSOT schema not found at ${ssotSchema}`);
} else {
  console.log('\n(SITE_REPO not set — pinned-sha mode only; set it locally to also diff the live SSOT)');
}

console.log(fails ? '\n✗ VENDOR STALE — re-vendor from AINumbers SSOT and update the pin in the SAME commit.'
                  : '\n✓ vendored _hash.mjs + schema are fresh vs the OCG SSOT.');
process.exit(fails ? 1 : 0);
