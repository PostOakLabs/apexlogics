#!/usr/bin/env node
/**
 * scripts/check-a11y-names.mjs — Form-field accessible-name gate
 * (AL-AUDIT-ACCESSIBILITY.md §B, AL-A11Y-NAMES — WCAG 2.1 1.3.1 / 4.1.2).
 *
 * The audit measured 645 form fields across 76 tool files with no accessible
 * name (sibling `<label>` with no `for=`, no aria-label, no aria-labelledby,
 * no wrapping label, no title) — a screen reader announces "edit, blank" and
 * the user must guess the field from reading order. AL-A11Y-NAMES closed all
 * 645 plus 7 nameless toggle switches (wrapping `<label>` containing only a
 * `<span class="slider">`, no text and no aria-label).
 *
 * This gate holds that state: every `<input>`/`<select>`/`<textarea>` in
 * tools/*\/index.html (excluding hidden/button/submit/reset/image/file)
 * must resolve an accessible name through the real ACCNAME computation
 * order:
 *
 * checkbox/radio were excluded from the original AL-A11Y-NAMES scope and
 * widened into it by AL-A11Y-CHECKBOX: 51 unnamed checkbox/radio inputs
 * across 11 tool files (5 JS-templated, given aria-label with the row's own
 * interpolated data; the rest static, given aria-label or a real for=/id
 * label). An unnamed checkbox reads "checkbox, checked" with no indication
 * of what it toggles — exactly as unusable as the text-input case above.
 *   aria-label > aria-labelledby (referenced text) > label[for=id] >
 *   wrapping <label> (ancestor) with text content > title
 * placeholder is NOT a name.
 *
 * Scope: tools/ only (168 files) — the row's own scope decision. Non-tool
 * surfaces (chaingraph/, workflows/, showcase/) were measured by the audit
 * but are out of scope for this gate; a future WU may extend it.
 *
 * False-positive discipline: this is a static-markup scan, so JS string/
 * comment text that merely CONTAINS "<input" etc. can look like a field.
 * We only scan matched HTML tags (never comment or script-string bodies)
 * for real attributes, but a template literal that emits a bare `<select>`
 * inside a JS comment can still tokenize as a tag — see AL-A11Y-NAMES done
 * note for the one known false positive (16-apprenticeship-matcher, a code
 * comment reading "Fires on <select> change"). If this gate ever flags a
 * file where the field genuinely doesn't exist in rendered markup, verify
 * by hand before adding a real fix — do not add an exception list.
 *
 * Usage: node scripts/check-a11y-names.mjs
 * Exit 0 = every scoped field has a resolvable accessible name. Exit 1 = one or more don't.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SKIP_INPUT = new Set(['hidden', 'button', 'submit', 'reset', 'image', 'file']);

function tokenize(html) {
  const tags = [];
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    tags.push({ close: m[1] === '/', tag: m[2].toLowerCase(), attrs: m[3], start: m.index, end: re.lastIndex });
  }
  return tags;
}
function attr(attrs, name) {
  const re = new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
  const m = attrs.match(re);
  if (!m) return null;
  return m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
}

function findUnnamed(html) {
  const tags = tokenize(html);

  // Match each opening <label> to its closing tag by depth, capturing inner text.
  const labelRecs = [];
  for (let i = 0; i < tags.length; i++) {
    if (tags[i].tag === 'label' && !tags[i].close) {
      const forId = attr(tags[i].attrs, 'for');
      let depth = 0, j = i;
      for (; j < tags.length; j++) {
        if (tags[j].tag === 'label') {
          if (!tags[j].close) depth++;
          else { depth--; if (depth === 0) break; }
        }
      }
      const inner = html.slice(tags[i].end, tags[j] ? tags[j].start : tags[i].end);
      const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      labelRecs.push({ openIdx: i, closeIdx: j, forId, text });
    }
  }
  const forMap = new Map();
  for (const l of labelRecs) if (l.forId && l.text) forMap.set(l.forId, l.text);

  // id -> nearby text, for aria-labelledby resolution.
  const idText = new Map();
  for (const t of tags) {
    const id = attr(t.attrs, 'id');
    if (id && !idText.has(id)) {
      const inner = html.slice(t.end, Math.min(t.end + 400, html.length));
      idText.set(id, inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120));
    }
  }

  const unnamed = [];
  for (const t of tags) {
    if (t.close || !['input', 'select', 'textarea'].includes(t.tag)) continue;
    const type = t.tag === 'input' ? (attr(t.attrs, 'type') || 'text').toLowerCase() : null;
    if (t.tag === 'input' && SKIP_INPUT.has(type)) continue;

    const id = attr(t.attrs, 'id');
    const ariaLabel = attr(t.attrs, 'aria-label');
    const ariaLabelledby = attr(t.attrs, 'aria-labelledby');
    const title = attr(t.attrs, 'title');

    if (ariaLabel && ariaLabel.trim()) continue;
    if (ariaLabelledby) {
      const ids = ariaLabelledby.split(/\s+/).filter(Boolean);
      const txt = ids.map(x => idText.get(x) || '').join(' ').trim();
      if (txt) continue;
    }
    if (id && forMap.has(id)) continue;

    const wrapping = labelRecs.find(l => l.text && tags[l.openIdx].start < t.start &&
      t.start < (l.closeIdx !== undefined ? tags[l.closeIdx].start : Infinity));
    if (wrapping) continue;

    if (title && title.trim()) continue;

    unnamed.push({ tag: t.tag, type: type || t.tag, id: id || null, start: t.start });
  }
  return unnamed;
}

function lineOf(html, pos) {
  return html.slice(0, pos).split('\n').length;
}

function listToolFiles() {
  const base = resolve(ROOT, 'tools');
  let entries;
  try { entries = readdirSync(base); } catch { return []; }
  return entries
    .filter(name => statSync(join(base, name)).isDirectory())
    .map(name => join('tools', name, 'index.html'))
    .filter(p => { try { return statSync(resolve(ROOT, p)).isFile(); } catch { return false; } });
}

const failures = [];
for (const rel of listToolFiles()) {
  const html = readFileSync(resolve(ROOT, rel), 'utf8');
  const unnamed = findUnnamed(html);
  for (const u of unnamed) {
    failures.push(`${rel}:${lineOf(html, u.start)}  <${u.tag}${u.id ? ' id="' + u.id + '"' : ''} type="${u.type}"> — no accessible name`);
  }
}

if (failures.length === 0) {
  console.log('check-a11y-names: clean — every form field in tools/ resolves an accessible name.');
  process.exit(0);
} else {
  console.log(`check-a11y-names: ${failures.length} field(s) with no accessible name:\n`);
  for (const f of failures) console.log(`  ${f}`);
  console.log('\nAdd for=/id pairing (preferred, CONTRACT §1.2) or aria-label. See AL-AUDIT-ACCESSIBILITY.md §B.');
  process.exit(1);
}
