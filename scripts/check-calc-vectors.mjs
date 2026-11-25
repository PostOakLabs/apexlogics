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
    const re = new RegExp(`(^|\\n)[ \\t]*(function\\s+${name}\\s*\\(|const\\s+${name}\\s*=)`);
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
  return ctx.__x;
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

if (fail) { console.error(`\n✗ CALC-VECTORS: ${fail} failed, ${pass} passed`); process.exit(1); }
console.log(`✓ CALC-VECTORS: all ${pass} vectors pass`);
