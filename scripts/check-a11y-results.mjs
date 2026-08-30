#!/usr/bin/env node
/**
 * scripts/check-a11y-results.mjs — Screen-reader results-announcement gate
 * (AL-A11Y-ANNOUNCE finding A, WCAG 2.1 4.1.3 Status Messages).
 *
 * A tool that silently mutates its results on Calculate is invisible to a
 * screen-reader user — the audit measured 161/168 tools with zero aria-live/
 * role="status"/role="alert" machinery anywhere in the page. This gate holds
 * the fixed state: every tools/*\/index.html must carry at least one of
 * aria-live / role="status" / role="alert" somewhere in its markup.
 *
 * This is a floor, not a full check — it does not verify the live region
 * wraps the *correct* element, only that the page has SOME live-region
 * machinery. That's deliberately the same bar the audit itself measured
 * against, so the gate matches the finding it closes.
 *
 * Usage: node scripts/check-a11y-results.mjs
 * Exit 0 = every tool has live-region machinery. Exit 1 = one or more don't.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const RE = /aria-live\s*=|role\s*=\s*["'](status|alert)["']/;

function listToolDirs() {
  const base = resolve(ROOT, 'tools');
  let entries;
  try {
    entries = readdirSync(base);
  } catch {
    return [];
  }
  return entries
    .filter(name => statSync(join(base, name)).isDirectory())
    .map(name => join('tools', name, 'index.html'))
    .filter(p => {
      try {
        return statSync(resolve(ROOT, p)).isFile();
      } catch {
        return false;
      }
    });
}

const failures = [];
for (const rel of listToolDirs()) {
  const text = readFileSync(resolve(ROOT, rel), 'utf8');
  if (!RE.test(text)) failures.push(rel);
}

if (failures.length === 0) {
  console.log('check-a11y-results: clean — every tool carries aria-live/role="status"/role="alert".');
  process.exit(0);
} else {
  console.log(`check-a11y-results: ${failures.length} tool(s) with no live-region machinery:\n`);
  for (const f of failures) console.log(`  ${f}`);
  console.log('\nAdd aria-live="polite" (or role="status") to the results container. See AL-AUDIT-ACCESSIBILITY.md §A.');
  process.exit(1);
}
