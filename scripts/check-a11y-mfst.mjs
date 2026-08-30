#!/usr/bin/env node
/**
 * scripts/check-a11y-mfst.mjs — mfst disclosure state-exposure gate
 * (AL-A11Y-ANNOUNCE finding C2, CG-24, WCAG 4.1.2 Name/Role/Value).
 *
 * Every page carrying the `mfst` MCP/manifest disclosure widget must expose
 * its open/collapsed state to assistive tech. `toggleMfst()` toggling a CSS
 * class or arrow glyph is a visual-only signal — a screen-reader user can't
 * tell whether the disclosure is open. The fix is one line per toggle
 * function: set `aria-expanded` on the button when the state flips, plus a
 * matching `aria-expanded="false"` in the button's initial markup.
 *
 * This gate re-derives the same universe check-no-storage.mjs's `toggleMfst`
 * usage scan would find (tools/showcase/workflows/chaingraph/root — anywhere
 * `toggleMfst` is called from) and asserts, per file:
 *   1. the button whose onclick calls toggleMfst() carries `aria-expanded`
 *   2. the toggleMfst() function body itself sets aria-expanded somewhere
 *      (a `.setAttribute('aria-expanded', ...)` call)
 *
 * Usage: node scripts/check-a11y-mfst.mjs
 * Exit 0 = every toggleMfst surface exposes state. Exit 1 = one or more don't.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walk(abs, out);
    } else if (name.endsWith('.html')) {
      out.push(abs);
    }
  }
  return out;
}

const allHtml = walk(ROOT, []);
const failures = [];

for (const abs of allHtml) {
  const rel = relative(ROOT, abs).replace(/\\/g, '/');
  const text = readFileSync(abs, 'utf8');
  if (!text.includes('toggleMfst')) continue;

  const btnMatch = text.match(/<button\b[^>]*\bonclick="toggleMfst\(\)"[^>]*>/);
  const btnHasExpanded = !!btnMatch && /aria-expanded\s*=/.test(btnMatch[0]);

  const fnStart = text.indexOf('function toggleMfst');
  let fnHasExpanded = false;
  if (fnStart !== -1) {
    // toggleMfst bodies in this suite are short (one-liner to a dozen lines);
    // 800 chars comfortably covers every variant without risking bleed into
    // an unrelated later function.
    const fnSlice = text.slice(fnStart, fnStart + 800);
    fnHasExpanded = /setAttribute\(\s*['"]aria-expanded['"]/.test(fnSlice);
  }

  if (!btnMatch || !btnHasExpanded || !fnHasExpanded) {
    failures.push({ rel, btnMatch: !!btnMatch, btnHasExpanded, fnHasExpanded });
  }
}

if (failures.length === 0) {
  console.log('check-a11y-mfst: clean — every toggleMfst surface exposes aria-expanded.');
  process.exit(0);
} else {
  console.log(`check-a11y-mfst: ${failures.length} file(s) with unexposed mfst disclosure state:\n`);
  for (const f of failures) {
    console.log(`  ${f.rel}  [button-found=${f.btnMatch} button-aria-expanded=${f.btnHasExpanded} fn-sets-aria-expanded=${f.fnHasExpanded}]`);
  }
  console.log('\nAdd aria-expanded="false" to the mfst button and setAttribute(\'aria-expanded\', ...) inside toggleMfst(). See AL-AUDIT-ACCESSIBILITY.md §C2.');
  process.exit(1);
}
