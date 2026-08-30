#!/usr/bin/env node
// gate-selftest.mjs — proves each chaingraph gate actually FAILS on a broken input.
// A gate that can't go red is theatre. For each gate we copy the real inputs into a temp
// dir, corrupt one thing, run the gate against the temp copy, and assert a non-zero exit.
// The real repo files are never mutated. Exit 0 only if every gate went red as designed.
//
// Usage: node scripts/gate-selftest.mjs
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;
let fails = 0;

// Run a node script; return true if it exited NON-zero (i.e. the gate went red).
function wentRed(scriptPath, { env = {}, cwd = REPO } = {}) {
  try {
    execFileSync(NODE, [scriptPath], { cwd, env: { ...process.env, ...env }, stdio: 'pipe' });
    return false; // exit 0 — gate stayed green
  } catch {
    return true; // non-zero exit — gate went red
  }
}
function assertRed(name, red) {
  if (red) console.log(`✓ ${name} goes RED on a broken fixture`);
  else { console.error(`✗ ${name} STAYED GREEN on a broken fixture — gate has no teeth`); fails++; }
}

const tmp = mkdtempSync(join(tmpdir(), 'apex-gate-selftest-'));

// ── 1. check-vendor-fresh: corrupt the vendored _hash.mjs body ──────────────
{
  const work = join(tmp, 'vendor');
  mkdirSync(join(work, 'chaingraph', 'kernels'), { recursive: true });
  mkdirSync(join(work, 'chaingraph', 'standard'), { recursive: true });
  mkdirSync(join(work, 'scripts'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-vendor-fresh.mjs'), join(work, 'scripts', 'check-vendor-fresh.mjs'));
  cpSync(join(REPO, 'chaingraph', 'standard', 'openchain-graph-v0.4.schema.json'),
         join(work, 'chaingraph', 'standard', 'openchain-graph-v0.4.schema.json'));
  // corrupt: append a stray statement to the hash body
  const hash = readFileSync(join(REPO, 'chaingraph', 'kernels', '_hash.mjs'), 'utf8');
  writeFileSync(join(work, 'chaingraph', 'kernels', '_hash.mjs'), hash + '\nvar TAMPERED = 1;\n');
  assertRed('check-vendor-fresh (tampered _hash.mjs body)', wentRed(join(work, 'scripts', 'check-vendor-fresh.mjs')));
}

// ── 2. schema-validate: corrupt a golden fixture (drop a required field) ─────
{
  const work = join(tmp, 'schema');
  mkdirSync(join(work, 'chaingraph', 'standard'), { recursive: true });
  mkdirSync(join(work, 'chaingraph', 'kernels', 'fixtures'), { recursive: true });
  cpSync(join(REPO, 'chaingraph', 'standard', 'schema-validate.mjs'), join(work, 'chaingraph', 'standard', 'schema-validate.mjs'));
  cpSync(join(REPO, 'chaingraph', 'standard', 'openchain-graph-v0.4.schema.json'), join(work, 'chaingraph', 'standard', 'openchain-graph-v0.4.schema.json'));
  cpSync(join(REPO, 'chaingraph', 'chaingraph.json'), join(work, 'chaingraph', 'chaingraph.json'));
  // Keep execution_hash (so the validator SELECTS it as an artifact), but make it an
  // invalid non-hex value and add a bogus top-level prop → fails pattern + strict props.
  const g = JSON.parse(readFileSync(join(REPO, 'chaingraph', 'kernels', 'fixtures', '40-gig-income-optimizer.golden.json'), 'utf8'));
  g.execution_hash = 'not-a-valid-sha256-digest'; g.bogus_extra = true;
  writeFileSync(join(work, 'chaingraph', 'kernels', 'fixtures', 'broken.golden.json'), JSON.stringify(g, null, 2));
  assertRed('schema-validate (fixture invalid execution_hash + extra prop)',
    wentRed(join(work, 'chaingraph', 'standard', 'schema-validate.mjs'),
      { env: { CHAINGRAPH: join(work, 'chaingraph', 'chaingraph.json'),
               SCHEMA: join(work, 'chaingraph', 'standard', 'openchain-graph-v0.4.schema.json'),
               FIXTURES_DIR: join(work, 'chaingraph', 'kernels', 'fixtures') } }));
}

// ── 3. hash-lint: plant a forbidden idiom in a temp tool ────────────────────
{
  const work = join(tmp, 'lint');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-tamper'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'hash-lint.mjs'), join(work, 'scripts', 'hash-lint.mjs'));
  writeFileSync(join(work, 'tools', 'zz-tamper', 'index.html'),
    '<script>const h = JSON.stringify(obj, ["a","b"]); execution_hash = "sha256:" + h;</script>\n');
  assertRed('hash-lint (planted array-replacer + sha256: prefix)', wentRed(join(work, 'scripts', 'hash-lint.mjs')));
}

// ── 4. hash-freeze: tamper a golden's execution_hash ────────────────────────
{
  const work = join(tmp, 'freeze');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'chaingraph', 'kernels', 'fixtures'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'hash-freeze.mjs'), join(work, 'scripts', 'hash-freeze.mjs'));
  cpSync(join(REPO, 'chaingraph', 'kernels', '_hash.mjs'), join(work, 'chaingraph', 'kernels', '_hash.mjs'));
  const g = JSON.parse(readFileSync(join(REPO, 'chaingraph', 'kernels', 'fixtures', '40-gig-income-optimizer.golden.json'), 'utf8'));
  g.execution_hash = 'f'.repeat(64); // valid shape, wrong digest
  writeFileSync(join(work, 'chaingraph', 'kernels', 'fixtures', 'broken.golden.json'), JSON.stringify(g, null, 2));
  assertRed('hash-freeze (tampered golden execution_hash)', wentRed(join(work, 'scripts', 'hash-freeze.mjs')));
}

// ── 5. check-constants-vintage: (a) SSOT mismatch, (b) declared-vs-embedded vintage
//      mismatch — asserted SEPARATELY (AL-G2-HALFB). The original version put both fixtures
//      in one tree and made a single assertRed over the combined run: fixture (a) alone
//      reddens any run it's in, so that assertion passed whether or not (b) ever fired — and
//      (b) turned out to be completely inert (see check-constants-vintage.mjs comments). Each
//      sub-case now gets its own tree and its own assertion so a regression in one can't hide
//      behind the other.
{
  // (a) SSOT mismatch: SS_WAGE_BASE stale at the 2024 value, declared vintage says 2026.
  {
    const work = join(tmp, 'vintage-a');
    mkdirSync(join(work, 'scripts'), { recursive: true });
    mkdirSync(join(work, 'data'), { recursive: true });
    mkdirSync(join(work, 'tools', 'zz-ssot-mismatch'), { recursive: true });
    cpSync(join(REPO, 'scripts', 'check-constants-vintage.mjs'), join(work, 'scripts', 'check-constants-vintage.mjs'));
    cpSync(join(REPO, 'data', 'apex-constants-2026.js'), join(work, 'data', 'apex-constants-2026.js'));
    writeFileSync(join(work, 'tools', 'zz-ssot-mismatch', 'index.html'),
      '<script>\nconst SS_WAGE_BASE = 168600; // stale\n</script>\n');
    writeFileSync(join(work, 'tools', 'zz-ssot-mismatch', 'manifest.json'),
      JSON.stringify({ data_vintage: 'SSA 2026 wage base $184,500' }));
    assertRed('check-constants-vintage (a: SSOT mismatch fixture)',
      wentRed(join(work, 'scripts', 'check-constants-vintage.mjs')));
  }

  // (b) declared-vs-embedded vintage mismatch: standard deduction is a real 2026 value (matches
  // SSOT, so (a) is silent), but the manifest declares 2024 via a stale Rev. Proc. citation —
  // same shape as the AL-CI-VINTAGE `08` defect, and the exact shape (a) cannot catch on its own.
  {
    const work = join(tmp, 'vintage-b');
    mkdirSync(join(work, 'scripts'), { recursive: true });
    mkdirSync(join(work, 'data'), { recursive: true });
    mkdirSync(join(work, 'tools', 'zz-vintage-mismatch'), { recursive: true });
    cpSync(join(REPO, 'scripts', 'check-constants-vintage.mjs'), join(work, 'scripts', 'check-constants-vintage.mjs'));
    cpSync(join(REPO, 'data', 'apex-constants-2026.js'), join(work, 'data', 'apex-constants-2026.js'));
    writeFileSync(join(work, 'tools', 'zz-vintage-mismatch', 'index.html'),
      '<script>\nconst STD_DEDUCTION = { single: 16100, mfj: 32200, hoh: 24150 };\n</script>\n');
    writeFileSync(join(work, 'tools', 'zz-vintage-mismatch', 'manifest.json'),
      JSON.stringify({ data_vintage: 'IRS Rev. Proc. 2023-34 (2024 standard deduction)' }));
    assertRed('check-constants-vintage (b: declared-vs-embedded vintage mismatch fixture)',
      wentRed(join(work, 'scripts', 'check-constants-vintage.mjs')));
  }
}

rmSync(tmp, { recursive: true, force: true });

console.log(fails ? `\n✗ gate-selftest: ${fails} gate(s) have no teeth.` : '\n✓ gate-selftest: every gate goes red on a broken fixture.');
process.exit(fails ? 1 : 0);
