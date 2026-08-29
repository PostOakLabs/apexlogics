#!/usr/bin/env node
/**
 * scripts/check-brand-titles.mjs — Title-brand + attribution gate (AL-BRAND-TITLES).
 *
 * Two assertions, both blocking:
 *   1. Every tool and showcase index.html <title> uses the compact brand token
 *      `ApexLogics` (never spaced `Apex Logics`) and, when it contains a separator,
 *      uses only `·` (never `|` or `—`).
 *   2. Every tool index.html contains the literal string `apexlogics.org`
 *      somewhere on the page (attribution — CC BY 4.0 requires the source be
 *      findable on the page itself, not just in an external manifest.json).
 *
 * Exists because commit f849374 fixed this drift in 2 tools without sweeping the
 * class (see board/done/AL-BRAND-TITLES.md) — it came back. No baseline, no
 * exception list: any hit fails.
 *
 * Usage: node scripts/check-brand-titles.mjs
 * Exit 0 = clean. Exit 1 = one or more violations (path + reason printed).
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function listDirs(base) {
  const baseAbs = resolve(ROOT, base);
  let entries;
  try {
    entries = readdirSync(baseAbs);
  } catch {
    return [];
  }
  return entries
    .filter(name => statSync(join(baseAbs, name)).isDirectory())
    .map(name => join(base, name, 'index.html'))
    .filter(p => {
      try {
        return statSync(resolve(ROOT, p)).isFile();
      } catch {
        return false;
      }
    });
}

const toolFiles = listDirs('tools');
const showcaseFiles = listDirs('showcase');
const allTitledFiles = toolFiles.concat(showcaseFiles);

let violations = [];

for (const rel of allTitledFiles) {
  const abs = resolve(ROOT, rel);
  const html = readFileSync(abs, 'utf8');
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!m) {
    violations.push({ file: rel, reason: 'no <title> tag found' });
    continue;
  }
  const title = m[1];
  if (title.includes('Apex Logics')) {
    violations.push({ file: rel, reason: `spaced brand token in <title>: "${title}"` });
  } else if (!title.includes('ApexLogics')) {
    violations.push({ file: rel, reason: `no ApexLogics brand token in <title>: "${title}"` });
  }
  if (title.includes('|') || title.includes('—')) {
    violations.push({ file: rel, reason: `non-canonical separator (must be "·") in <title>: "${title}"` });
  }
}

for (const rel of toolFiles) {
  const abs = resolve(ROOT, rel);
  const html = readFileSync(abs, 'utf8');
  if (!html.includes('apexlogics.org')) {
    violations.push({ file: rel, reason: 'no "apexlogics.org" attribution string found on page' });
  }
}

if (violations.length === 0) {
  console.log(`check-brand-titles: clean — ${allTitledFiles.length} titles, ${toolFiles.length} tools checked for attribution.`);
  process.exit(0);
} else {
  console.log(`check-brand-titles: ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.log(`  ${v.file}  ::  ${v.reason}`);
  }
  console.log('\nZero tolerance — no baseline, no exception list (AL-BRAND-TITLES).');
  process.exit(1);
}
