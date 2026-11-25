#!/usr/bin/env node
// check-calc-vectors.mjs — CALCULATOR VECTOR GATE (AL-AUDIT2, blocking).
//
// Pins the corrected rules of browser-only calculators (tools with no worker kernel,
// so the worker's kernel tests can't cover them) against cases worked from the
// primary source. Each suite pulls the named top-level declarations (functions and
// consts) out of the SHIPPED tools/<id>/index.html and runs them in a node:vm
// sandbox, so the gate tests the code visitors actually run, not a copy.
//
// Usage: node scripts/check-calc-vectors.mjs   (exit 1 on any failed vector)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// Return the source text of each named top-level `function NAME(` or `const NAME =`
// declaration, matched by bracket depth (strings and template literals skipped).
export function extractDecls(html, names) {
  const out = [];
  for (const name of names) {
    const n = name.replace(/[$]/g, '\\$&');
    const re = new RegExp(`(^|\\n)[ \\t]*(function\\s+${n}\\s*\\(|const\\s+${n}\\s*=)`);
    const m = re.exec(html);
    if (!m) throw new Error(`declaration not found: ${name}`);
    const start = m.index + m[1].length;
    let i = start, depth = 0, seenBody = false;
    const isFn = /function/.test(m[2]);
    for (; i < html.length; i++) {
      const c = html[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c; i++;
        while (i < html.length && html[i] !== q) { if (html[i] === '\\') i++; i++; }
        continue;
      }
      if (c === '/' && html[i + 1] === '/') { while (i < html.length && html[i] !== '\n') i++; continue; }
      if (c === '{' || c === '(' || c === '[') { depth++; if (c === '{') seenBody = true; }
      else if (c === '}' || c === ')' || c === ']') {
        depth--;
        if (isFn && depth === 0 && c === '}' && seenBody) { i++; break; }
      } else if (!isFn && depth === 0 && c === ';') { i++; break; }
    }
    out.push(html.slice(start, i));
  }
  return out.join('\n');
}

function load(toolDir, names, extra = '') {
  const html = readFileSync(join(REPO, 'tools', toolDir, 'index.html'), 'utf8');
  const src = extractDecls(html, names) + '\n' + extra;
  const ctx = vm.createContext({ Math, Number, String, Object, JSON });
  vm.runInContext(src + `\n;globalThis.__x = { ${names.filter((n) => !/^[A-Z_0-9]+$/.test(n)).join(', ')} };`, ctx);
  return Object.assign(ctx.__x, { ctx });
}

let fail = 0, pass = 0;
const eq = (label, got, want) => {
  if (got === want) { pass++; }
  else { fail++; console.error(`✗ ${label}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
};

// ── #02 FAFSA SAI simulator: Pell award ordering (20 USC 1070a(b)(1)) ──────────────
// (A) max-Pell AGI test, then (B) max Pell − SAI with a negative SAI counted as 0
// (rounded to $5), and only if (B) is below the minimum, (C) the minimum-Pell AGI
// test. 2026-27: max 7,395, min 740, SAI cutoff 14,790 (2 × max, OBBBA).
{
  const { determinePell } = load('02-fafsa-sai-simulator', [
    'PELL_MAX', 'PELL_MIN', 'SAI_PELL_CUTOFF', 'FPL_2024', 'FPL_2024_AK', 'FPL_2024_HI',
    'PELL_MAX_THRESHOLDS', 'PELL_MIN_THRESHOLDS', 'fpl', 'fmt', 'determinePell',
  ]);
  // Dependent, family of 4 (FPL 31,200): max-Pell line 175% = 54,600; min-Pell line 275% = 85,800.
  const p = (agi, sai) => determinePell(agi, 4, sai, 'dep_nonsingle', 'TX');
  eq('#02 SAI 0, AGI in the min-Pell band → full 7,395 (was 740)', p(70000, 0).award, 7395);
  eq('#02 SAI −1,500 → 7,395, not above max (was 8,895)', p(100000, -1500).award, 7395);
  eq('#02 SAI 2,000 in the min-Pell band → 5,395 (was 740)', p(70000, 2000).award, 5395);
  eq('#02 SAI 2,003 rounds to nearest $5 → 5,390', p(100000, 2003).award, 5390);
  eq('#02 SAI 7,000 in the min-Pell band → minimum 740', p(70000, 7000).award, 740);
  eq('#02 SAI 7,000 above the min-Pell band → 0', p(100000, 7000).award, 0);
  eq('#02 AGI under the max-Pell line → 7,395', p(50000, 9000).award, 7395);
  eq('#02 SAI at the 2× cutoff → 0', p(50000, 14790).award, 0);
}

// ── #164 estate tax: prior taxable gifts counted once (IRC §2001(b), §2010(c)(4)) ──
// Tax = 40% × (taxable estate + adjusted taxable gifts − full exemption incl. DSUE).
// The gifts are in the base, so the exemption isn't cut for them a second time.
// The DSUE left at a death is the basic exclusion minus that same gift-inclusive base.
{
  const { ctx } = load('164-estate-tax-liability', ['numOr', 'dollars', 'calculate'], `
    var _lastInputs, _lastResults, __vals = {};
    function render() {}
    function $(id) {
      const v = __vals[id];
      return typeof v === 'boolean' ? { checked: v } : { value: String(v) };
    }
    globalThis.__runEstate = (over) => {
      __vals = Object.assign({
        filingPosture: 'single', grossEstate: 18500000, debts: 1200000, adminExpenses: 220000,
        maritalDeduction: 0, spouseIsCitizen: true, charitableDeduction: 500000,
        adjustedTaxableGifts: 400000, dsue: 0, exemptionPerIndividual: 15000000, topRatePct: 40,
        stateApplies: false, stateExemption: 2000000, stateRatePct: 12,
        inheritanceApplies: false, inheritanceRatePct: 10, nonExemptHeirShare: 0,
      }, over);
      calculate();
      return _lastResults;
    };`);
  const run = ctx.__runEstate;
  eq('#164 default case: 40% × (16.98M − 15M) = 792,000 (was 952,000)', run({}).federalEstateTaxAdj, 792000);
  eq('#164 default case: available exemption is the full 15M', run({}).availableExemption, 15000000);
  eq('#164 no prior gifts: 40% × (20M − 15M) = 2,000,000',
    run({ grossEstate: 20000000, debts: 0, adminExpenses: 0, charitableDeduction: 0, adjustedTaxableGifts: 0 }).federalEstateTaxAdj, 2000000);
  eq('#164 married, 2M prior gifts: portable DSUE = 15M − 12M = 3M (was 1M)',
    run({ filingPosture: 'married', grossEstate: 10000000, debts: 0, adminExpenses: 0, charitableDeduction: 0, adjustedTaxableGifts: 2000000 }).unusedExemptionAtFirstDeath, 3000000);
  eq('#164 married with 5M DSUE: 16.98M base under 20M → no federal tax',
    run({ filingPosture: 'married', dsue: 5000000 }).federalEstateTaxAdj, 0);
  eq('#164 gifts above the exemption are flagged (gift tax payable not credited)',
    run({ adjustedTaxableGifts: 16000000 }).giftsExceedExemption, true);
}

// ── #150 IRMAA: which table applies to married-filing-separately (20 CFR 418.1120) ──
// MFS and lived with the spouse at any time in the year → the MFS table ($109,000 /
// $391,000, mapping to the top two premium tiers); lived apart all year → the single
// table. The top band starts at "greater than or equal to" (CMS 2026 fact sheet).
{
  const { ctx } = load('150-irmaa-bracket-calculator', ['money', 'bps', 'parseNumList', 'tierLookup', 'calculate'], `
    var _lastInputs, _lastResults, __vals = {};
    function render() {}
    function $(id) {
      const v = __vals[id];
      return typeof v === 'boolean' ? { checked: v } : { value: String(v) };
    }
    globalThis.__runIrmaa = (over) => {
      __vals = Object.assign({
        filingStatus: 'Single', mfsLivingApart: 'yes', agi: 150000, taxExemptInterest: 0,
        enrollees: 1, enrolledPartD: false, additionalIncome: 0, lifeChangingEvent: false,
        cPremiumYear: 2026, cLookback: 2,
        cIrmaaSingle: '109000,137000,171000,205000,500000', cIrmaaMFJ: '218000,274000,342000,410000,750000',
        cIrmaaMFS: '109000,391000', cPartB: '202.90,284.10,405.80,527.50,649.20,689.90',
        cPartD: '0,14.50,37.50,60.40,83.30,91.00',
      }, over);
      calculate();
      return _lastResults;
    };`);
  const run = ctx.__runIrmaa;
  const together = { filingStatus: 'MFS', mfsLivingApart: 'no' };
  eq('#150 MFS lived together, MAGI 150k → Part B 649.20 (was 405.80)', run({ ...together, agi: 150000 }).partBMonthly, 649.20);
  eq('#150 MFS lived together, MAGI 150k, Part D → surcharge 83.30', run({ ...together, agi: 150000, enrolledPartD: true }).partDSurchargeMonthly, 83.30);
  eq('#150 MFS lived together, MAGI 100k → standard 202.90', run({ ...together, agi: 100000 }).partBMonthly, 202.90);
  eq('#150 MFS lived together, MAGI 390,999 → 649.20', run({ ...together, agi: 390999 }).partBMonthly, 649.20);
  eq('#150 MFS lived together, MAGI 391,000 → 689.90 (top band is >=)', run({ ...together, agi: 391000 }).partBMonthly, 689.90);
  eq('#150 MFS lived together, next threshold 391,000', run({ ...together, agi: 150000 }).nextThreshold, 391000);
  eq('#150 MFS lived together, crossing 391k costs (689.90 − 649.20) × 12 = 488.40', run({ ...together, agi: 150000 }).crossingCostAnnual, 488.40);
  eq('#150 MFS lived apart all year, MAGI 150k → single table tier 2, 405.80', run({ filingStatus: 'MFS', mfsLivingApart: 'yes', agi: 150000 }).partBMonthly, 405.80);
  eq('#150 single, MAGI exactly 500,000 → top tier 689.90', run({ agi: 500000 }).partBMonthly, 689.90);
  eq('#150 single, MAGI 499,999 → 649.20', run({ agi: 499999 }).partBMonthly, 649.20);
  eq('#150 MFJ, MAGI exactly 218,000 → standard 202.90', run({ filingStatus: 'MFJ', agi: 218000 }).partBMonthly, 202.90);
}

// A minimal stand-in for `document`: inputs read from __vals, everything else a sink.
const FAKE_DOM = `
  var __vals = {}, __els = {};
  var document = { getElementById(id) {
    if (!__els[id]) {
      const v = __vals[id];
      __els[id] = { value: v === undefined ? '' : String(v), checked: v === true, textContent: '', innerHTML: '',
        style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {} };
    }
    return __els[id];
  } };
  var window = {};
  function __set(vals) { __vals = vals; __els = {}; }`;

// ── #112 / #23 SEP for the self-employed (IRS Pub 560) ───────────────────────────
// A 25% plan rate becomes 20% (0.25 ÷ 1.25) of net SE earnings after the ½ SE-tax
// deduction, capped at $72,000. SE tax: 12.4% up to the $184,500 wage base + 2.9%.
{
  const { ctx } = load('112-solo-401k-vs-sep-ira', ['LIMITS', 'fmt', 'SE_FACTOR', 'SS_WAGE_BASE', '_ov', 'calcSERetirement'], FAKE_DOM + `
    globalThis.__run112 = (netIncome, age = 45) => {
      __set({ netIncome, age, marginalRate: 24, existingPlan: 'no', existingContrib: 0 });
      calcSERetirement();
      return window._lastResult;
    };`);
  const r = (n, a) => ctx.__run112(n, a);
  eq('#112 net SE 120k: SEP 20% of 111,522 = 22,304 (was 27,881)', Math.round(r(120000).sepContrib), 22304);
  eq('#112 net SE 120k: Solo 401(k) employer piece 22,304', Math.round(r(120000).solo401kEmployer), 22304);
  eq('#112 net SE 120k: Solo 401(k) total 24,500 + 22,304', Math.round(r(120000).solo401kTotal), 46804);
  eq('#112 net SE 300k: SS tax stops at the 184,500 wage base → SEP 56,909', Math.round(r(300000).sepContrib), 56909);
  eq('#112 net SE 500k: SEP capped at 72,000', Math.round(r(500000).sepContrib), 72000);
}
{
  const { ctx } = load('23-freelance-1099-total-cost-calculator',
    ['FED_BRACKETS', 'STD_DEDUCTION', 'SE_RATE', 'SE_NET_PCT', 'MILEAGE_RATE', 'STATE_RATES', 'fmt$', 'calcDeductions'],
    FAKE_DOM + `
    var dedFilingStatus = 'single';
    globalThis.__run23 = (gross, sepAmt) => {
      __set({ ded_gross: gross, ded_state_tier: 0, ded_sep: true, ded_sep_amt: sepAmt });
      calcDeductions();
      return document.getElementById('ded-sep-display').textContent;
    };`);
  eq('#23 1099 net 120k, SEP 50k asked → capped at $22,304 (was $30,000)', ctx.__run23(120000, 50000), '$22,304');
  eq('#23 SEP under the cap passes through', ctx.__run23(120000, 10000), '$10,000');
}

// ── #115 RSU withholding gap: the vest stacked on annual salary (2026 brackets) ──
// Federal tax on the vest = tax(salary + vest − standard deduction) − tax(salary −
// standard deduction), bracket by bracket, against 22% supplemental withholding.
{
  const { ctx } = load('115-rsu-withholding-gap',
    ['SS_WAGE_BASE', 'SS_SUPP', 'MC_SUPP', 'MC_SURCHARGE', 'NIIT_THRESHOLD', 'STATE_RATES', 'FED_SUPP',
     'STD_DEDUCTION', 'fedBrackets', 'calcFedMarginal', 'calcFedTax', 'fmt', 'yearGap', 'calcRSUGap'],
    FAKE_DOM + `
    var _lastResult = null;
    globalThis.__run115 = (o) => {
      __set(Object.assign({ fmv: 125, shares: 500, moreVests: 0, salary: 210000, filingStatus: 'single',
        ytdIncome: 105000, ytdSS: 105000, state: 'none' }, o));
      calcRSUGap();
      return _lastResult;
    };`);
  const r = (o = {}) => ctx.__run115(o);
  eq('#115 single, salary 210k, vest 62,500: gap 5,625 (was 1,250)', Math.round(r().fedGap), 5625);
  eq('#115 the vest spans 24/32/35%: top rate 35%', r().fedMarginal, 0.35);
  eq('#115 MFJ, salary 150k, vest 20k, all in 22%: no gap', Math.round(r({ filingStatus: 'mfj', salary: 150000, fmv: 100, shares: 200 }).fedGap), 0);
  eq('#115 single, salary 60k, vest 10k: over-withheld by 650', Math.round(r({ salary: 60000, fmv: 100, shares: 100 }).fedGap), -650);
  eq('#115 two vests of 62,500 on 210k: year gap 13,750', Math.round(r({ moreVests: 1 }).totalYearGap), 13750);
}

if (fail) { console.error(`\n✗ CALC-VECTORS: ${fail} failed, ${pass} passed`); process.exit(1); }
console.log(`✓ CALC-VECTORS: all ${pass} vectors pass`);
