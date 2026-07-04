#!/usr/bin/env node
// hash-lint.mjs — CANON-INTEGRITY REGRESSION GATE (repo/ CI preflight).
//
// The suite's execution_hash is a cross-vendor trust anchor: SHA-256 over the JCS
// canonicalization of the FULL {policy_parameters, output_payload}, emitted as BARE
// lowercase hex. Several once-seen "canonicalizations" silently produce a DIFFERENT
// (or unstable, or reduced) preimage and MUST NOT reappear. This gate scans the shipped
// tool + workflow HTML for those forbidden idioms so a regression can't slip in invisibly.
//
// FORBIDDEN (ORCHESTRATION §4 hash-lint list):
//   F1 array-replacer canon  — JSON.stringify(x, [..])  (a whitelist replacer silently
//                              DROPS keys → hashes a reduced object).
//   F2 non-crypto simpleHash — simpleHash()/hashCode()/the (h<<5)-h / imul(...,) rolling
//                              idioms used in place of SHA-256.
//   F3 sha256:-prefix emit   — concatenating a "sha256:" prefix onto the emitted hash
//                              (breaks bare-hex cross-vendor verify; the cutover moved to
//                              bare hex). NOTE: stripping a leading "sha256:" on the VERIFY
//                              side is REQUIRED and explicitly allowed — only *emitting* the
//                              prefix is forbidden, so we match prefix CONSTRUCTION, never
//                              .replace()/startsWith() strip code or explanatory comments.
//
// NOT statically linted here (documented): reduced-payload hashing (hashing a hand-built
// subset instead of the full pair) — caught instead by the golden hash-freeze fixtures,
// whose committed execution_hash only recomputes if the full pair was hashed.
//
// Usage: node scripts/hash-lint.mjs   (exit 1 on any hit)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// Collect every shipped HTML that could emit an artifact: tools/<slug>/index.html
// (per-tool dirs) plus workflows/*.html (flat decision-journey pages).
function htmlFiles() {
  const out = [];
  const toolsDir = join(REPO, 'tools');
  if (existsSync(toolsDir)) {
    for (const slug of readdirSync(toolsDir)) {
      const p = join(toolsDir, slug, 'index.html');
      if (existsSync(p) && statSync(p).isFile()) out.push(p);
    }
  }
  const wfDir = join(REPO, 'workflows');
  if (existsSync(wfDir)) {
    for (const name of readdirSync(wfDir)) {
      const p = join(wfDir, name);
      if (name.endsWith('.html') && statSync(p).isFile()) out.push(p);
    }
  }
  return out;
}

// Strip comments so idioms mentioned in prose ("no 'sha256:' prefix", "bare hex") never
// false-positive. Removes /* … */ blocks and // line comments. Good enough for lint scope
// (a "//" or "/*" inside a string literal is not a pattern we match on anyway).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // keep the char before // (avoids eating "http://")
}

const RULES = [
  { id: 'F1', desc: 'array-replacer canon JSON.stringify(x, [..]) drops keys',
    re: /JSON\.stringify\s*\([^,()]+,\s*\[/ },
  { id: 'F2', desc: 'non-crypto simpleHash/hashCode/(h<<5)-h/imul rolling hash',
    re: /\bsimpleHash\b|\bhashCode\s*\(|\(\s*h\s*<<\s*5\s*\)\s*-\s*h|Math\.imul\s*\([^)]*,\s*h\b/ },
  { id: 'F3', desc: 'emitting a "sha256:" prefix on the hash (must be bare hex)',
    re: /(['"`]sha256:['"`]?\s*\+|execution_hash\s*[:=]\s*['"`]sha256:|`sha256:\$\{)/ },
];

let hits = 0;
const files = htmlFiles();
for (const f of files) {
  const code = stripComments(readFileSync(f, 'utf8'));
  for (const rule of RULES) {
    if (rule.re.test(code)) {
      console.error(`✗ ${rule.id} ${f.replace(REPO, '.')} — ${rule.desc}`);
      hits++;
    }
  }
}

if (hits) {
  console.error(`\n✗ hash-lint: ${hits} forbidden canon idiom(s) across ${files.length} files. Fix before commit.`);
  process.exit(1);
}
console.log(`✓ hash-lint: ${files.length} tool/workflow files clean — no forbidden canon idioms.`);
process.exit(0);
