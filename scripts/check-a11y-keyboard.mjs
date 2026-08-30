#!/usr/bin/env node
/**
 * scripts/check-a11y-keyboard.mjs — keyboard-operability gate for div/span
 * click handlers (AL-A11Y-ANNOUNCE finding C3, WCAG 2.1.1 Keyboard + 4.1.2
 * Name/Role/Value).
 *
 * A `<div>`/`<span>` with an `onclick` handler and no `role`/`tabindex` can't
 * receive keyboard focus and can't be activated with Enter/Space — a mouse-
 * only control. The audit's own grep for the `toggle-header` CLASS caught 6
 * of the real 26 offending tools; the real defect class is ANY div/span
 * onclick with no role/tabindex, 82 sites across 26 tools. This gate matches
 * that corrected pattern, not the narrower one.
 *
 * `<button>` elements are exempt (already keyboard-operable natively) — this
 * gate only fires on div/span, matching the actual defect.
 *
 * Usage: node scripts/check-a11y-keyboard.mjs
 * Exit 0 = every div/span onclick carries role + tabindex. Exit 1 = one or
 * more don't (path:line + tag snippet printed).
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TAG_RE = /<(div|span)\b([^>]*?)\bonclick="([^"]*)"([^>]*)>/gi;

function listToolFiles() {
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
for (const rel of listToolFiles()) {
  const abs = resolve(ROOT, rel);
  const text = readFileSync(abs, 'utf8');
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text))) {
    const attrs = m[2] + m[4];
    // Matches the audit's own defect definition: fails only when BOTH role
    // and tabindex are absent. A div/span already carrying either (e.g. a
    // popover backdrop with role="dialog" that isn't itself meant to be
    // tab-focusable) is out of scope for this finding.
    if (/\brole\s*=/.test(attrs) || /\btabindex\s*=/.test(attrs)) continue;
    const upto = text.slice(0, m.index);
    const line = upto.split('\n').length;
    failures.push({ rel, line, snippet: m[0].slice(0, 120) });
  }
}

if (failures.length === 0) {
  console.log('check-a11y-keyboard: clean — every div/span onclick carries role + tabindex.');
  process.exit(0);
} else {
  console.log(`check-a11y-keyboard: ${failures.length} keyboard-inaccessible site(s):\n`);
  for (const f of failures) console.log(`  ${f.rel}:${f.line}  ${f.snippet}`);
  console.log('\nAdd role="button" tabindex="0" and a keydown handler for Enter/Space (or convert to <button>). See AL-AUDIT-ACCESSIBILITY.md §C3.');
  process.exit(1);
}
