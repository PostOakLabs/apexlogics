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
// Python gates (check_index_sync.py) run under `python`, matching deploy.yml's own
// invocation — not NODE.
function wentRedPy(scriptPath, args, { cwd = REPO } = {}) {
  try {
    execFileSync('python', [scriptPath, ...args], { cwd, stdio: 'pipe' });
    return false;
  } catch {
    return true;
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'apex-gate-selftest-'));

// ── coverage bookkeeping (AL-GATE-SELFTEST-ALL, AL-GATE-HONESTY) ────────────
// Every claim below registers the gate name it proves, so the closing message
// states real coverage instead of repeating the "every gate" overclaim
// gate-selftest itself was found to have made (AL-AUDIT-GATE-INTEGRITY §B1)
// while covering a fraction of them.
//
// DEPLOY_GATES used to be a hand-maintained array here — the exact
// "hand-maintained-surface-list" defect class check_tools.js hit twice
// (AL-JSGATE-SCOPE missed workflows/+chaingraph/, AL-JSGATE-SHOWCASE missed
// showcase/) and was fixed both times by deriving the list instead of
// maintaining it. A gate added to deploy.yml and never added to a hardcoded
// array here would escape this meta-guard silently, so the list is now
// parsed straight out of deploy.yml's own `run:` lines instead.
function deployGatesFromWorkflow() {
  const yml = readFileSync(join(REPO, '.github', 'workflows', 'deploy.yml'), 'utf8');
  const RUN_RE = /run:\s*(?:node|python)\s+(?:scripts\/|chaingraph\/standard\/)([\w.-]+\.(?:mjs|js|py))/g;
  const found = new Set();
  let m;
  while ((m = RUN_RE.exec(yml))) found.add(m[1]);
  found.delete('gate-selftest.mjs'); // this script — not a claim on itself
  return [...found].sort();
}
const DEPLOY_GATES = deployGatesFromWorkflow();
let claims = 0;
const covered = new Set();
const untestable = new Set();
function claim(gateFile, name, red) {
  claims++;
  covered.add(gateFile);
  assertRed(name, red);
}

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
  claim('check-vendor-fresh.mjs', 'check-vendor-fresh (tampered _hash.mjs body)', wentRed(join(work, 'scripts', 'check-vendor-fresh.mjs')));
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
  claim('schema-validate.mjs', 'schema-validate (fixture invalid execution_hash + extra prop)',
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
  claim('hash-lint.mjs', 'hash-lint (planted array-replacer + sha256: prefix)', wentRed(join(work, 'scripts', 'hash-lint.mjs')));
}

// ── 3b. hash-domain-lint: plant a clock-derived value inside the hash domain ────
{
  const work = join(tmp, 'domainlint');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-tamper'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'hash-domain-lint.mjs'), join(work, 'scripts', 'hash-domain-lint.mjs'));
  // Same shape as the real A-1/A-2 defect: a value derived from new Date().getFullYear()
  // lands on a key that is NOT in the _cgDomain exclusion list.
  writeFileSync(join(work, 'tools', 'zz-tamper', 'index.html'), `<script>
const currentYear = new Date().getFullYear();
const forgiveYear = currentYear + 5;
function build() {
  const payload = {};
  payload.tool_id = "zz";
  payload.generated_at = new Date().toISOString();
  payload.pslf_forgive_year = forgiveYear;
  const _cgDomain = {}; for (const _k in payload) { if (["generated_at","tool_id"].indexOf(_k) === -1) _cgDomain[_k] = payload[_k]; }
  payload.execution_hash = "x";
}
</script>\n`);
  claim('hash-domain-lint.mjs', 'hash-domain-lint (planted clock-derived hash-domain key)', wentRed(join(work, 'scripts', 'hash-domain-lint.mjs')));
}

// ── 3c. chain-coherence-check: two chained tools disagree on a shared constant ──
// Schema matches the real chaingraph.json (AL-G3-CHAINSHAPE): `chains[].steps[].tool_id`
// resolved against a top-level `nodes[]` registry keyed by tool_id/al_id with a `url` the
// gate derives a file path from. Two separate fixtures assert two separate claims:
// (i) a REAL shared-key disagreement goes RED, (ii) two tools scoping the same constant
// name to different, non-overlapping subkeys — a scope difference, not drift — stays GREEN
// (this is the exact shape the pre-fix gate would have false-positived on, per the WU).
{
  const work = join(tmp, 'chaincoh');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'chaingraph'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-aa'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-bb'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'chain-coherence-check.mjs'), join(work, 'scripts', 'chain-coherence-check.mjs'));
  const mkNode = (tool_id, al_id) => ({ tool_id, al_id, url: `https://apexlogics.org/tools/${tool_id}/` });
  writeFileSync(join(work, 'chaingraph', 'chaingraph.json'), JSON.stringify({
    nodes: [mkNode('zz-aa', 'AL-01'), mkNode('zz-bb', 'AL-02')],
    chains: [{ name: 'zz-chain', steps: [{ tool_id: 'zz-aa' }, { tool_id: 'zz-bb' }] }],
  }));
  writeFileSync(join(work, 'tools', 'zz-aa', 'index.html'),
    '<script>const STD_DEDUCTION = { single: 16100, mfj: 32200 };</script>\n');
  writeFileSync(join(work, 'tools', 'zz-bb', 'index.html'),
    '<script>const STD_DEDUCTION = { single: 14600, mfj: 29200 };</script>\n'); // stale 2024 value — same keys, different values
  claim('chain-coherence-check.mjs', 'chain-coherence-check (two chained tools disagree on a shared STD_DEDUCTION key)',
    wentRed(join(work, 'scripts', 'chain-coherence-check.mjs'), { env: { ROOT: work } }));
}
{
  const work = join(tmp, 'chaincoh-scope');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'chaingraph'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-cc'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-dd'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'chain-coherence-check.mjs'), join(work, 'scripts', 'chain-coherence-check.mjs'));
  const mkNode = (tool_id, al_id) => ({ tool_id, al_id, url: `https://apexlogics.org/tools/${tool_id}/` });
  writeFileSync(join(work, 'chaingraph', 'chaingraph.json'), JSON.stringify({
    nodes: [mkNode('zz-cc', 'AL-03'), mkNode('zz-dd', 'AL-04')],
    chains: [{ name: 'zz-chain-2', steps: [{ tool_id: 'zz-cc' }, { tool_id: 'zz-dd' }] }],
  }));
  writeFileSync(join(work, 'tools', 'zz-cc', 'index.html'),
    '<script>const TIER_VALUE = { m7: 650000, t15: 480000 };</script>\n');
  writeFileSync(join(work, 'tools', 'zz-dd', 'index.html'),
    '<script>const TIER_VALUE = { m7: 650000, t15: 480000, t50: 220000 };</script>\n'); // extra key, shared keys agree
  const red = wentRed(join(work, 'scripts', 'chain-coherence-check.mjs'), { env: { ROOT: work } });
  claims++; covered.add('chain-coherence-check.mjs');
  if (!red) console.log('✓ chain-coherence-check stays GREEN on a scope-only difference (no shared-key disagreement)');
  else { console.error('✗ chain-coherence-check FALSE-POSITIVED on a scope-only difference — has too many teeth'); fails++; }
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
  claim('hash-freeze.mjs', 'hash-freeze (tampered golden execution_hash)', wentRed(join(work, 'scripts', 'hash-freeze.mjs')));
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
    claim('check-constants-vintage.mjs', 'check-constants-vintage (a: SSOT mismatch fixture)',
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
    claim('check-constants-vintage.mjs', 'check-constants-vintage (b: declared-vs-embedded vintage mismatch fixture)',
      wentRed(join(work, 'scripts', 'check-constants-vintage.mjs')));
  }

  // (c) CURRENT_YEAR SSOT mismatch (AL-G3-CHAINSHAPE) — the AL-CI-HASHDOMAIN rollover
  // anchor now has a sensor; prove it actually reddens on a stale value.
  {
    const work = join(tmp, 'vintage-c');
    mkdirSync(join(work, 'scripts'), { recursive: true });
    mkdirSync(join(work, 'data'), { recursive: true });
    mkdirSync(join(work, 'tools', 'zz-year-mismatch'), { recursive: true });
    cpSync(join(REPO, 'scripts', 'check-constants-vintage.mjs'), join(work, 'scripts', 'check-constants-vintage.mjs'));
    cpSync(join(REPO, 'data', 'apex-constants-2026.js'), join(work, 'data', 'apex-constants-2026.js'));
    writeFileSync(join(work, 'tools', 'zz-year-mismatch', 'index.html'),
      '<script>\nconst CURRENT_YEAR = 2025; // stale — SSOT says 2026\n</script>\n');
    writeFileSync(join(work, 'tools', 'zz-year-mismatch', 'manifest.json'),
      JSON.stringify({ data_vintage: '2026' }));
    claim('check-constants-vintage.mjs', 'check-constants-vintage (c: CURRENT_YEAR SSOT mismatch fixture)',
      wentRed(join(work, 'scripts', 'check-constants-vintage.mjs')));
  }
}

// ── 6. check_tools.js: inject a JS syntax error ─────────────────────────────
{
  const work = join(tmp, 'jsgate');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-syntax'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check_tools.js'), join(work, 'scripts', 'check_tools.js'));
  writeFileSync(join(work, 'tools', 'zz-syntax', 'index.html'),
    '<!doctype html><html><head><title>probe</title></head><body><script>const x = ;</script></body></html>\n');
  claim('check_tools.js', 'check_tools.js (injected JS syntax error)', wentRed(join(work, 'scripts', 'check_tools.js')));
}

// ── 7. check-ap2-validate: 6 distinct claims (A1–A6), each a synthetic tool ──
{
  function mkAp2Probe(label, slug, body, name) {
    const work = join(tmp, 'ap2-' + slug);
    mkdirSync(join(work, 'scripts'), { recursive: true });
    mkdirSync(join(work, 'tools', slug), { recursive: true });
    cpSync(join(REPO, 'scripts', 'check-ap2-validate.mjs'), join(work, 'scripts', 'check-ap2-validate.mjs'));
    writeFileSync(join(work, 'tools', slug, 'index.html'),
      `<!doctype html><html><head><title>probe</title></head><body>${body}</body></html>\n`);
    claim('check-ap2-validate.mjs', name, wentRed(join(work, 'scripts', 'check-ap2-validate.mjs')));
  }
  mkAp2Probe('A1', 'zz-ap2-a1',
    `<script>const AP2Schema = { validate(m){ return []; } }; const x = AP2Schema.totallyBogusMember(y);</script>`,
    'check-ap2-validate A1 (undeclared member call)');
  mkAp2Probe('A2', 'zz-ap2-a2',
    `<script>const AP2Schema = { validate(m){ return { valid: m.ok }; } }; const res = AP2Schema.validate(y); if (res) {}</script>`,
    'check-ap2-validate A2 (dead guard — OBJECT tested truthy)');
  mkAp2Probe('A3', 'zz-ap2-a3',
    `<script>const AP2Schema = { validate(m){ return []; } }; const res = AP2Schema.validate(y); if (!res.valid) {}</script>`,
    'check-ap2-validate A3 (tripping guard — ARRAY read .valid)');
  mkAp2Probe('A4', 'zz-ap2-a4',
    `<script>const AP2Schema = { validate(m){ console.log(m); } }; AP2Schema.validate(y);</script>`,
    'check-ap2-validate A4 (unclassifiable return shape)');
  mkAp2Probe('A5', 'zz-ap2-a5',
    `<script>const AP2Schema = { validate(m){ return []; } };</script>`,
    'check-ap2-validate A5 (declared validator never referenced)');
  mkAp2Probe('A6', 'zz-ap2-a6',
    `<script>function exportAP2(){ const blob = new Blob([JSON.stringify({})], {type:'application/json'}); }</script>`,
    'check-ap2-validate A6 (no AP2Schema + json download + no signal)');
}

// ── 7b. check-dangling-dom: unguarded getElementById('X') with no id="X" ────
{
  const work = join(tmp, 'dangling');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-dangling'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-dangling-dom.mjs'), join(work, 'scripts', 'check-dangling-dom.mjs'));
  writeFileSync(join(work, 'tools', 'zz-dangling', 'index.html'),
    "<!doctype html><html><body><script>document.getElementById('missingThing').textContent='x';</script></body></html>\n");
  claim('check-dangling-dom.mjs', 'check-dangling-dom (unguarded getElementById with no matching id=)',
    wentRed(join(work, 'scripts', 'check-dangling-dom.mjs')));
  // and prove it stays GREEN when the id genuinely resolves — a gate with no
  // negative-control fixture can't be trusted not to flag every real page too.
  const workGood = join(tmp, 'dangling-ok');
  mkdirSync(join(workGood, 'scripts'), { recursive: true });
  mkdirSync(join(workGood, 'tools', 'zz-ok'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-dangling-dom.mjs'), join(workGood, 'scripts', 'check-dangling-dom.mjs'));
  writeFileSync(join(workGood, 'tools', 'zz-ok', 'index.html'),
    "<!doctype html><html><body><div id=\"realThing\"></div><script>document.getElementById('realThing').textContent='x';</script></body></html>\n");
  const stayedGreen = !wentRed(join(workGood, 'scripts', 'check-dangling-dom.mjs'));
  claims++; covered.add('check-dangling-dom.mjs');
  if (stayedGreen) console.log('✓ check-dangling-dom stays GREEN when the id genuinely resolves');
  else { console.error('✗ check-dangling-dom FALSE-POSITIVED on a resolved id — has too many teeth'); fails++; }
}

// ── 8. verify-counts: drift a count sentinel (real files — the ATTR_RULES
//      hard-code prose from index.html/tools.html/mcp.json/mcp.html/llms.txt,
//      so this copies the REAL current files rather than fabricating text
//      that would have to match every regex) ──────────────────────────────
{
  const work = join(tmp, 'verifycounts');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, '.well-known'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'verify-counts.mjs'), join(work, 'scripts', 'verify-counts.mjs'));
  cpSync(join(REPO, 'scripts', 'counts.mjs'), join(work, 'scripts', 'counts.mjs'));
  cpSync(join(REPO, 'suite-registry.json'), join(work, 'suite-registry.json'));
  cpSync(join(REPO, 'index.html'), join(work, 'index.html'));
  cpSync(join(REPO, 'tools.html'), join(work, 'tools.html'));
  cpSync(join(REPO, 'mcp.html'), join(work, 'mcp.html'));
  cpSync(join(REPO, 'llms.txt'), join(work, 'llms.txt'));
  cpSync(join(REPO, '.well-known', 'mcp.json'), join(work, '.well-known', 'mcp.json'));
  cpSync(join(REPO, '.well-known', 'agent-card.json'), join(work, '.well-known', 'agent-card.json'));
  cpSync(join(REPO, 'workflows'), join(work, 'workflows'), { recursive: true });
  cpSync(join(REPO, 'guides'), join(work, 'guides'), { recursive: true });
  const idx = readFileSync(join(work, 'index.html'), 'utf8');
  const bumped = idx.replace(/<!--COUNT:tools-->(\d+)<!--\/COUNT-->/, (m, v) => `<!--COUNT:tools-->${Number(v) + 1}<!--/COUNT-->`);
  writeFileSync(join(work, 'index.html'), bumped);
  claim('verify-counts.mjs', 'verify-counts (drifted tools sentinel in index.html)', wentRed(join(work, 'scripts', 'verify-counts.mjs')));
}

// ── 9. check-registry-self: drift registry_version vs itself ────────────────
{
  const work = join(tmp, 'regself');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-registry-self.mjs'), join(work, 'scripts', 'check-registry-self.mjs'));
  const raw = readFileSync(join(REPO, 'suite-registry.json'), 'utf8').replace(/\x00+$/, '');
  const reg = JSON.parse(raw);
  reg.tools_count_shipped = -1; // drifted vs the derived count of tools[]
  writeFileSync(join(work, 'suite-registry.json'), JSON.stringify(reg, null, 2));
  claim('check-registry-self.mjs', 'check-registry-self (tools_count_shipped drifted from tools[] derived count)', wentRed(join(work, 'scripts', 'check-registry-self.mjs')));
}

// ── 10. check-no-storage: inject a localStorage write ───────────────────────
{
  const work = join(tmp, 'nostorage');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-storage'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-no-storage.mjs'), join(work, 'scripts', 'check-no-storage.mjs'));
  writeFileSync(join(work, 'tools', 'zz-storage', 'index.html'),
    '<!doctype html><html><head><title>probe</title></head><body><script>localStorage.setItem("x",1)</script></body></html>\n');
  claim('check-no-storage.mjs', 'check-no-storage (injected localStorage.setItem)', wentRed(join(work, 'scripts', 'check-no-storage.mjs')));
}

// ── 10a. check-copy-hallmarks: em-dash over the baselined budget ────────────
{
  const work = join(tmp, 'copyhallmarks');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-copyhallmarks'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-copy-hallmarks.mjs'), join(work, 'scripts', 'check-copy-hallmarks.mjs'));
  // No baseline file in the fixture dir — an em-dash on a file absent from the
  // baseline must fail outright (zero allowance), same as a baselined file
  // exceeding its budget.
  writeFileSync(join(work, 'tools', 'zz-copyhallmarks', 'index.html'),
    '<!doctype html><html><head><title>probe</title></head><body><p>Fast — but not just fast, thorough.</p></body></html>\n');
  claim('check-copy-hallmarks.mjs', 'check-copy-hallmarks (em-dash + "not just X but" over budget)', wentRed(join(work, 'scripts', 'check-copy-hallmarks.mjs')));
}

// ── 10b. check-a11y-results: tool with no aria-live/role="status"/"alert" ───
{
  const work = join(tmp, 'a11yresults');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-noresults'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-a11y-results.mjs'), join(work, 'scripts', 'check-a11y-results.mjs'));
  writeFileSync(join(work, 'tools', 'zz-noresults', 'index.html'),
    '<!doctype html><html><body><div id="results-panel">no live region here</div></body></html>\n');
  claim('check-a11y-results.mjs', 'check-a11y-results (tool with no aria-live/role status/alert)', wentRed(join(work, 'scripts', 'check-a11y-results.mjs')));
}

// ── 10c. check-a11y-mfst: two distinct claims — missing button attribute,
//      and function that never sets aria-expanded (AL-A11Y-ANNOUNCE §C2) ────
{
  const work = join(tmp, 'a11ymfst-a');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-mfst-a'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-a11y-mfst.mjs'), join(work, 'scripts', 'check-a11y-mfst.mjs'));
  writeFileSync(join(work, 'tools', 'zz-mfst-a', 'index.html'), `<!doctype html><html><body>
    <button class="mfst-btn" onclick="toggleMfst()">MCP / Manifest</button>
    <script>function toggleMfst(){var b=document.getElementById('mfstBody');b.style.display='block';b.setAttribute('aria-expanded','true');}</script>
    </body></html>\n`);
  claim('check-a11y-mfst.mjs', 'check-a11y-mfst (a: button missing aria-expanded attribute)', wentRed(join(work, 'scripts', 'check-a11y-mfst.mjs')));
}
{
  const work = join(tmp, 'a11ymfst-b');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-mfst-b'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-a11y-mfst.mjs'), join(work, 'scripts', 'check-a11y-mfst.mjs'));
  writeFileSync(join(work, 'tools', 'zz-mfst-b', 'index.html'), `<!doctype html><html><body>
    <button class="mfst-btn" id="mfstBtn" onclick="toggleMfst()" aria-expanded="false">MCP / Manifest</button>
    <script>function toggleMfst(){var b=document.getElementById('mfstBody');b.style.display='block';}</script>
    </body></html>\n`);
  claim('check-a11y-mfst.mjs', 'check-a11y-mfst (b: toggleMfst() never sets aria-expanded)', wentRed(join(work, 'scripts', 'check-a11y-mfst.mjs')));
}

// ── 10cc. check-contrast: reintroduce a failing --muted value (#3E5675) ─────
{
  const work = join(tmp, 'contrast');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-contrast'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-contrast.mjs'), join(work, 'scripts', 'check-contrast.mjs'));
  writeFileSync(join(work, 'tools', 'zz-contrast', 'index.html'),
    '<!doctype html><html><head><style>:root{--bg:#070B14;--muted:#3E5675;--text-dim:#64748b;}</style></head><body>probe</body></html>\n');
  claim('check-contrast.mjs', 'check-contrast (reintroduced #3E5675 --muted, below 3:1 floor on --bg)', wentRed(join(work, 'scripts', 'check-contrast.mjs')));
}

// ── 10d. check-a11y-keyboard: div onclick with no role and no tabindex ──────
{
  const work = join(tmp, 'a11ykbd');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-kbd'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-a11y-keyboard.mjs'), join(work, 'scripts', 'check-a11y-keyboard.mjs'));
  writeFileSync(join(work, 'tools', 'zz-kbd', 'index.html'),
    '<!doctype html><html><body><div class="toggle-header" onclick="toggleSection(\'x\')">Section</div></body></html>\n');
  claim('check-a11y-keyboard.mjs', 'check-a11y-keyboard (div onclick with no role/tabindex)', wentRed(join(work, 'scripts', 'check-a11y-keyboard.mjs')));
}

// ── 10e. check-a11y-names: two claims — stripped for= goes RED, a correctly-
//      wrapped toggle label (text inside <label>, no for=) stays GREEN. The
//      audit found true wrapping labels are a real, already-used naming
//      mechanism here (59 toggles) — a gate that flags those has no teeth
//      within a week (AL-A11Y-NAMES row note). Both claims share one fixture
//      tree so the wrapping case is proven not to trip the same run that
//      proves the stripped case does.
{
  const work = join(tmp, 'a11ynames');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-names'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-a11y-names.mjs'), join(work, 'scripts', 'check-a11y-names.mjs'));
  writeFileSync(join(work, 'tools', 'zz-names', 'index.html'), `<!doctype html><html><body>
    <div class="field">
      <label>Annual Salary ($)</label>
      <input type="number" id="salary" value="50000" />
    </div>
    <label class="toggle">Enable soft costs<input type="checkbox" id="softCosts" checked><span class="slider"></span></label>
    </body></html>\n`);
  claim('check-a11y-names.mjs', 'check-a11y-names (stripped sibling label with no for= goes RED)',
    wentRed(join(work, 'scripts', 'check-a11y-names.mjs')));
  // Isolate the wrapping toggle in its own tree to prove it alone does NOT trip the gate.
  const workGood = join(tmp, 'a11ynames-wrap-only');
  mkdirSync(join(workGood, 'scripts'), { recursive: true });
  mkdirSync(join(workGood, 'tools', 'zz-wrap'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-a11y-names.mjs'), join(workGood, 'scripts', 'check-a11y-names.mjs'));
  writeFileSync(join(workGood, 'tools', 'zz-wrap', 'index.html'), `<!doctype html><html><body>
    <label class="toggle">Enable soft costs<input type="checkbox" id="softCosts" checked><span class="slider"></span></label>
    </body></html>\n`);
  const wrapRed = wentRed(join(workGood, 'scripts', 'check-a11y-names.mjs'));
  claims++; covered.add('check-a11y-names.mjs');
  if (!wrapRed) console.log('✓ check-a11y-names stays GREEN on a correctly-wrapped toggle label (text-bearing wrap resolves the name; not flagged)');
  else { console.error('✗ check-a11y-names FALSE-POSITIVED on a correctly-wrapped toggle label — has too many teeth'); fails++; }
}

// ── 10f. check-a11y-names: bare checkbox/radio with no name at all goes RED
//      (AL-A11Y-CHECKBOX — widened SKIP_INPUT to stop excluding checkbox/
//      radio). A bare checkbox with no label, aria-label, or wrap is exactly
//      as unusable to a screen reader as a bare text input was.
{
  const work = join(tmp, 'a11ynames-checkbox');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-checkbox'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-a11y-names.mjs'), join(work, 'scripts', 'check-a11y-names.mjs'));
  writeFileSync(join(work, 'tools', 'zz-checkbox', 'index.html'), `<!doctype html><html><body>
    <div class="ded-row">
      <input type="checkbox" id="ded_bare">
      <div class="ded-name">Home Office</div>
    </div>
    </body></html>\n`);
  claim('check-a11y-names.mjs', 'check-a11y-names (bare unnamed checkbox goes RED)',
    wentRed(join(work, 'scripts', 'check-a11y-names.mjs')));
}

// ── 11. check-links: create a dead internal href ────────────────────────────
{
  const work = join(tmp, 'links');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-links'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-links.mjs'), join(work, 'scripts', 'check-links.mjs'));
  writeFileSync(join(work, 'tools', 'zz-links', 'index.html'),
    '<!doctype html><html><head><title>probe</title></head><body><a href="/tools/this-slug-does-not-exist-xyz/index.html">x</a></body></html>\n');
  claim('check-links.mjs', 'check-links (dead internal href)', wentRed(join(work, 'scripts', 'check-links.mjs')));
}

// ── 12. check-brand-titles: two INDEPENDENT fixtures, one assertion each
//       (AL-GATE-HONESTY). The original single fixture broke both rules at
//       once ("two claims in one fixture", per its own comment) — if the
//       attribution check ever regressed, the spaced-brand violation in the
//       same title would keep the one assertion green (AL-G2-HALFB shape).
//       Each half now gets a clean fixture that trips ONLY that rule.
{
  // (a) spaced brand token, title otherwise canonical, attribution present —
  // isolates the title-token rule from the attribution rule.
  const work = join(tmp, 'brandtitles-a');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-brand-a'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-brand-titles.mjs'), join(work, 'scripts', 'check-brand-titles.mjs'));
  writeFileSync(join(work, 'tools', 'zz-brand-a', 'index.html'),
    '<!doctype html><html><head><title>Apex Logics · Probe Tool</title></head><body>apexlogics.org</body></html>\n');
  claim('check-brand-titles.mjs', 'check-brand-titles (a: spaced brand token, attribution present)', wentRed(join(work, 'scripts', 'check-brand-titles.mjs')));
}
{
  // (b) compact brand token, canonical separator, attribution MISSING —
  // isolates the attribution rule from the title-token rule.
  const work = join(tmp, 'brandtitles-b');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-brand-b'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-brand-titles.mjs'), join(work, 'scripts', 'check-brand-titles.mjs'));
  writeFileSync(join(work, 'tools', 'zz-brand-b', 'index.html'),
    '<!doctype html><html><head><title>ApexLogics · Probe Tool</title></head><body>no attribution here</body></html>\n');
  claim('check-brand-titles.mjs', 'check-brand-titles (b: canonical title, missing apexlogics.org attribution)', wentRed(join(work, 'scripts', 'check-brand-titles.mjs')));
}

// ── 13. check-seo-meta: page missing og:image ───────────────────────────────
{
  const work = join(tmp, 'seometa');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-seo-meta.mjs'), join(work, 'scripts', 'check-seo-meta.mjs'));
  writeFileSync(join(work, 'probe.html'), `<!doctype html><html><head>
    <title>probe</title>
    <meta name="description" content="probe">
    <link rel="canonical" href="https://apexlogics.org/probe.html">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="ApexLogics">
    <meta property="og:title" content="probe">
    <meta property="og:description" content="probe">
    <meta property="og:url" content="https://apexlogics.org/probe.html">
    <meta name="twitter:card" content="summary">
    </head><body>probe</body></html>\n`);
  claim('check-seo-meta.mjs', 'check-seo-meta (page missing og:image)', wentRed(join(work, 'scripts', 'check-seo-meta.mjs')));
}

// ── 13a. check-llms-entries: delete one shipped tool's llms.txt entry ───────
{
  const work = join(tmp, 'llmsentries');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'workflows'), { recursive: true });
  mkdirSync(join(work, 'guides'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check-llms-entries.mjs'), join(work, 'scripts', 'check-llms-entries.mjs'));
  cpSync(join(REPO, 'scripts', 'counts.mjs'), join(work, 'scripts', 'counts.mjs'));
  cpSync(join(REPO, 'suite-registry.json'), join(work, 'suite-registry.json'));
  const llms = readFileSync(join(REPO, 'llms.txt'), 'utf8');
  const oneEntry = llms.match(/^### #\S+ · AL-\d+ — .+\n(?:.*\n)*?(?=\n)/m)[0];
  writeFileSync(join(work, 'llms.txt'), llms.replace(oneEntry, ''));
  claim('check-llms-entries.mjs', 'check-llms-entries (deleted one shipped AL-ID entry)', wentRed(join(work, 'scripts', 'check-llms-entries.mjs')));
}

// ── 14. check_index_sync.py: remove a tool card from tools.html ─────────────
{
  const work = join(tmp, 'idxsync');
  mkdirSync(join(work, 'scripts'), { recursive: true });
  mkdirSync(join(work, 'tools', 'zz-idx'), { recursive: true });
  cpSync(join(REPO, 'scripts', 'check_index_sync.py'), join(work, 'scripts', 'check_index_sync.py'));
  writeFileSync(join(work, 'tools', 'zz-idx', 'index.html'), '<!doctype html><html><body>probe</body></html>\n');
  writeFileSync(join(work, 'tools.html'), '<!doctype html><html><body>no card for zz-idx</body></html>\n');
  claim('check_index_sync.py', 'check_index_sync.py (tool on disk has no card in tools.html)',
    wentRedPy(join(work, 'scripts', 'check_index_sync.py'), ['--strict', '--no-color'], { cwd: work }));
}

// ── untestable gates — named honestly rather than silently dropped from the
//    coverage claim (AL-AUDIT-GATE-INTEGRITY §C: gen-sitemap needs full git
//    history, check-chaingraph-parity needs live network; neither is
//    reproducible via filesystem defect injection in this harness) ─────────
untestable.add('gen-sitemap.mjs');
untestable.add('check-chaingraph-parity.mjs');
console.log('⚠ gen-sitemap.mjs: UNTESTABLE by this harness — needs full git history (fetch-depth: 0), not exercisable via filesystem injection.');
console.log('⚠ check-chaingraph-parity.mjs: UNTESTABLE by this harness — needs live network (GitHub raw fetch), not exercisable via filesystem injection.');

rmSync(tmp, { recursive: true, force: true });

const missing = DEPLOY_GATES.filter(g => !covered.has(g) && !untestable.has(g));
if (missing.length) {
  console.error(`\n✗ gate-selftest: ${missing.length} CI-invoked gate(s) have no assertRed at all: ${missing.join(', ')}`);
  fails++;
}

console.log(fails
  ? `\n✗ gate-selftest: ${fails} gate(s)/claim(s) have no teeth.`
  : `\n✓ gate-selftest: ${covered.size} of ${DEPLOY_GATES.length} CI-invoked gates proven red across ${claims} distinct claims; ${untestable.size} named untestable (${[...untestable].join(', ')}).`);
process.exit(fails ? 1 : 0);
