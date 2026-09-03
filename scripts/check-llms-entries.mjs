#!/usr/bin/env node
/**
 * scripts/check-llms-entries.mjs — llms.txt entry-level drift gate (AL-LLMS-ENTRIES).
 *
 * verify-counts.mjs asserts the header/summary text ("Tools: 168 shipped …") but never
 * counts the actual `### #N · AL-ID — Title` entry rows beneath it, so a tool could ship,
 * pass every other gate, and still be silently absent from the agent-facing index — which
 * is exactly what happened to AL-160 (found by ESTATE-AUDIT-2026-09-03 §P1-1: 167 entries
 * vs. 168 shipped, one AL-ID missing, header count untouched).
 *
 * This gate:
 *   1. Counts `^### #` lines in llms.txt and compares to `tools_count_shipped` derived
 *      from suite-registry.json (via counts.mjs's `tools` figure).
 *   2. Extracts the AL-ID out of every entry heading and diffs that set against every
 *      shipped AL-ID in the registry — reports missing (in registry, not in llms.txt)
 *      and extra (in llms.txt, not in registry) by name.
 *
 * Usage: node scripts/check-llms-entries.mjs
 * Exit 0 = counts and AL-ID sets agree. Exit 1 = drift (both classes reported, named).
 */
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { deriveCounts } from './counts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// AL-ID may be a composite like "AL-06+16" (two AL-IDs combined into one shipped
// tool before either had an individual slug) — do NOT split on "+", per
// ESTATE-AUDIT-2026-09-03 §P1-2's standing note on this exact class of ID.
const ENTRY_RE = /^### #\S+ · (AL-[\d+]+) —/gm;

export function checkLlmsEntries() {
  const llms = readFileSync(join(ROOT, 'llms.txt'), 'utf8');
  const raw = readFileSync(join(ROOT, 'suite-registry.json'), 'utf8').replace(/\x00+$/, '');
  const registry = JSON.parse(raw);

  const shippedIds = new Set(
    registry.tools.filter(t => t.category !== 'showcase').map(t => t.al_id)
  );

  const entryIds = [];
  let m;
  while ((m = ENTRY_RE.exec(llms))) entryIds.push(m[1]);
  const entryIdSet = new Set(entryIds);

  const { tools: expectedCount } = deriveCounts();
  const errors = [];

  if (entryIds.length !== expectedCount) {
    errors.push(`ENTRY-COUNT  llms.txt has ${entryIds.length} "### #" entries, expected ${expectedCount} (suite-registry.json shipped tools)`);
  }

  const dupes = entryIds.filter((id, i) => entryIds.indexOf(id) !== i);
  if (dupes.length) {
    errors.push(`DUPLICATE-ENTRY  AL-ID(s) appear more than once in llms.txt: ${[...new Set(dupes)].join(', ')}`);
  }

  const missing = [...shippedIds].filter(id => !entryIdSet.has(id)).sort();
  if (missing.length) {
    errors.push(`MISSING-ENTRY  shipped AL-ID(s) absent from llms.txt: ${missing.join(', ')}`);
  }

  const extra = [...entryIdSet].filter(id => !shippedIds.has(id)).sort();
  if (extra.length) {
    errors.push(`EXTRA-ENTRY  llms.txt AL-ID(s) not in shipped registry: ${extra.join(', ')}`);
  }

  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = checkLlmsEntries();
  if (errors.length) {
    errors.forEach(e => console.error(e));
    console.error(`FAIL — ${errors.length} llms.txt entry drift issue(s)`);
    process.exit(1);
  }
  console.log('OK — llms.txt entries match shipped registry AL-IDs 1:1');
}
