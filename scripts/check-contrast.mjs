#!/usr/bin/env node
/**
 * scripts/check-contrast.mjs — Muted/dim text-token contrast gate (AL-A11Y-CONTRAST, gate D).
 *
 * CONTRACT small-text tokens `--muted` and `--text-dim` must meet WCAG 2.1 AA (4.5:1)
 * against that file's own `--bg`. Computed via sRGB-linearised relative luminance, not
 * pattern-matched against a known-bad list — a new bad value must fail this the same as
 * the ones this WU fixed.
 *
 * Usage: node scripts/check-contrast.mjs
 * Exit 0 = clean. Exit 1 = one or more violations (path + token + ratio printed).
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const AA_SMALL_TEXT = 4.5;

const GLOBS = [
  'tools/*/index.html',
  'showcase/*/index.html',
  'chaingraph/*.html',
  'workflows/*/index.html',
  'guides/*/index.html',
  '*.html',
];

function expandGlob(pattern) {
  const [dirPart, filePart] = pattern.includes('/')
    ? [pattern.slice(0, pattern.lastIndexOf('/')), pattern.slice(pattern.lastIndexOf('/') + 1)]
    : ['', pattern];

  if (dirPart.includes('*')) {
    const baseDir = dirPart.slice(0, dirPart.indexOf('*'));
    const baseAbs = resolve(ROOT, baseDir);
    let entries;
    try {
      entries = readdirSync(baseAbs);
    } catch {
      return [];
    }
    return entries
      .filter(name => statSync(join(baseAbs, name)).isDirectory())
      .map(name => join(baseDir, name, filePart))
      .filter(p => {
        try {
          return statSync(resolve(ROOT, p)).isFile();
        } catch {
          return false;
        }
      });
  }

  const baseAbs = resolve(ROOT, dirPart || '.');
  let entries;
  try {
    entries = readdirSync(baseAbs);
  } catch {
    return [];
  }
  const suffix = filePart.replace('*', '');
  return entries
    .filter(name => name.endsWith(suffix) && name !== suffix)
    .filter(name => statSync(join(baseAbs, name)).isFile())
    .map(name => join(dirPart, name));
}

function linearize(c) {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(hexA, hexB) {
  const l1 = luminance(hexA);
  const l2 = luminance(hexB);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// Matches `--bg: #070B14`, `--muted:#8891a8`, `--text-dim:  #64748b` — tolerant of the
// inconsistent spacing already present across the suite's inline <style> blocks.
const TOKEN_RE = /--(bg|muted|text-dim)\s*:\s*(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)\b/g;

function scanFile(absPath) {
  const rel = relative(ROOT, absPath).replace(/\\/g, '/');
  const text = readFileSync(absPath, 'utf8');

  let bg = null;
  const mutedVals = new Set();
  const dimVals = new Set();

  for (const m of text.matchAll(TOKEN_RE)) {
    const [, name, hex] = m;
    if (name === 'bg' && bg === null) bg = hex;
    else if (name === 'muted') mutedVals.add(hex);
    else if (name === 'text-dim') dimVals.add(hex);
  }

  if (!bg) return [];

  const violations = [];
  for (const [tokenName, vals] of [['--muted', mutedVals], ['--text-dim', dimVals]]) {
    for (const hex of vals) {
      const ratio = contrastRatio(hex, bg);
      if (ratio < AA_SMALL_TEXT) {
        violations.push({ file: rel, token: tokenName, value: hex, bg, ratio: ratio.toFixed(2) });
      }
    }
  }
  return violations;
}

let allViolations = [];
for (const pattern of GLOBS) {
  const files = expandGlob(pattern);
  for (const f of files) {
    allViolations.push(...scanFile(resolve(ROOT, f)));
  }
}

if (allViolations.length === 0) {
  console.log(`check-contrast: clean — every --muted/--text-dim token meets ${AA_SMALL_TEXT}:1 against its own --bg.`);
  process.exit(0);
} else {
  console.log(`check-contrast: ${allViolations.length} violation(s):\n`);
  for (const v of allViolations) {
    console.log(`  ${v.file}  [${v.token}: ${v.value} on ${v.bg}]  ratio ${v.ratio}:1 (need ${AA_SMALL_TEXT}:1)`);
  }
  console.log('\nAA small-text floor is 4.5:1 (WCAG 2.1). Fix the token value, not the background (AL-A11Y-CONTRAST).');
  process.exit(1);
}
