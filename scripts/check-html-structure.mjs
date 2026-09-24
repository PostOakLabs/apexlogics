#!/usr/bin/env node
/**
 * scripts/check-html-structure.mjs — HTML structural-parse gate (RC-2).
 *
 * ROOT CAUSE CLOSED HERE (ROOT-CAUSE-REVIEW-2026-09-24 §2 RC-2): bulk regex
 * edits over 279 pages (the CG-36 footer restyle, 4be4e80) shipped markup
 * damage that every existing gate was blind to, because check_tools.js only
 * parses the CONTENTS of <script> blocks — anything outside a script block
 * (CSS, markup, text after </html>) is invisible to it. Tool 69 rendered
 * ~300 lines of JavaScript as visible page text for ~111 days while the JS
 * syntax gate stayed green, because the broken JS wasn't inside a script
 * element anymore (PRJ-004 / NEW-C). This gate parses document STRUCTURE so
 * the next bulk edit cannot ship silently broken markup.
 *
 * Zero dependencies by design (the repo ships no node_modules; the
 * root-cause review's parse5/html5lib suggestion is implemented as a small
 * HTML5-flavoured tokenizer + open-element stack instead). It walks the same
 * tree construction rules that matter structurally:
 *
 *   - void elements (br, img, input, …) never open a frame
 *   - raw-text elements (script, style, textarea, title, …) scan to their
 *     real end tag, so `<` inside JS/CSS is never mistaken for markup
 *   - implied end tags are tolerated: li, p, option, dd/dt, tr/td/th,
 *     thead/tbody/tfoot, optgroup — exactly the shapes the fleet's
 *     hand-written HTML legitimately relies on (PRJ-004 verification
 *     requirement: "use an HTML5 parser, not raw opening/closing counts")
 *   - SVG/MathML (foreign content) honours self-closing `/>`; HTML elements
 *     ignore the solidus per spec
 *
 * Violations (all fail the gate, path:line printed):
 *
 *   unclosed-element        an element still open when </body>, </html> or
 *                           EOF arrives (the 15-page unclosed-<div> cohort,
 *                           PRJ-004)
 *   stray-end-tag           an end tag whose element is not open at all
 *                           (the 26-page premature-close cohort — one extra
 *                           </div> each; tools.html's four orphan </a>;
 *                           tool 08's orphan </button>, PRJ-004)
 *   end-tag-too-early       an end tag that closes an ancestor while a
 *                           non-implied child element is still open
 *   content-after-html      non-whitespace, non-comment content after
 *                           </html> (tool 69's stranded ~300 lines of JS,
 *                           NEW-C)
 *   content-between-body    non-whitespace between </body> and </html>
 *   duplicate-attribute     the same attribute twice in one tag (tool 125's
 *                           double id=, PRJ-004)
 *   attr-garbage-after-value non-whitespace after a quoted attribute value
 *                           (tool 74's backslash-escaped apostrophe — HTML
 *                           has no backslash escapes, so the value ends at
 *                           the first quote and the tail parses as bogus
 *                           attributes, PRJ-004)
 *   comment-double-dash     `--` inside comment content or an abrupt
 *                           `<!-->` / `<!--->` close (tool 08's
 *                           `<!-- ---- x ---- -->` banners)
 *
 * Pages come from scripts/_pages.mjs (RC-1: no gate declares its own globs).
 * Zero allowed. No baseline file, no exception list — the point of landing
 * it baselined at 0 is that the next bulk edit runs THIS gate before commit
 * (RC-2 standing order), and a baseline would let the next tool 69 creep in
 * under cover of "already known."
 *
 * Usage: node scripts/check-html-structure.mjs
 * Exit 0 = clean. Exit 1 = one or more violations (path:line + kind printed).
 */
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { listShippedPages } from './_pages.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── HTML5 element classes ────────────────────────────────────────────────────
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr', 'basefont', 'bgsound', 'frame', 'keygen',
]);

// Raw-text / escapable-raw-text elements: content is plain text up to the
// matching end tag. `<` inside a script string is not markup.
const RAWTEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);

// Elements whose end tags are implied when a sibling/parent boundary arrives
// (HTML5 "generate implied end tags"). A stack entry above a closing element
// is popped silently iff its tag is here.
const IMPLIED_ENDABLE = new Set([
  'p', 'li', 'dd', 'dt', 'option', 'optgroup', 'td', 'th', 'tr', 'thead',
  'tbody', 'tfoot', 'caption', 'colgroup', 'rt', 'rp', 'rb', 'rtc',
]);

// HTML5 "special" category, minus the ones already in IMPLIED_ENDABLE /
// VOID / RAWTEXT above. An element from this set still open above the
// element an end tag names is a real nesting error (end-tag-too-early);
// anything NOT in this set (span, a, em, custom elements, …) is silently
// implied-closed by browsers, so flagging it would be a false positive.
const SPECIAL = new Set([
  'address', 'applet', 'article', 'aside', 'blockquote', 'body', 'button',
  'center', 'details', 'dialog', 'dir', 'div', 'dl', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'head', 'header', 'hgroup', 'html', 'main', 'marquee', 'menu', 'nav',
  'object', 'ol', 'pre', 'section', 'select', 'summary', 'table', 'template',
  'ul', 'xmp',
]);

// Start tags that imply-close an open <p> (HTML5 in-body "close a p
// element" set + li/dd/dt which do it as part of their own rule).
const CLOSES_P = new Set([
  'address', 'article', 'aside', 'blockquote', 'center', 'details', 'dialog',
  'dir', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main',
  'menu', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'ul',
  'listing', 'plaintext', 'xmp',
]);

const FOREIGN_ROOTS = new Set(['svg', 'math']);

// ── The structural walk ──────────────────────────────────────────────────────
// Returns [{ line, kind, detail }] for one document.
export function checkStructure(text) {
  const violations = [];
  const push = (line, kind, detail) => violations.push({ line, kind, detail });

  const stack = []; // { tag, line, foreign:boolean }
  let foreignDepth = 0; // >0 → inside svg/math: `/>` self-closes
  let sawHtmlClose = false;
  let sawBodyClose = false;

  let i = 0;
  let line = 1;
  const n = text.length;

  const advance = (to) => { line += countNl(text, i, to); i = to; };

  while (i < n) {
    if (sawHtmlClose) {
      // Anything non-whitespace after </html> is stranded — it never renders
      // as intended (tool 69: ~300 lines of JS parsed as visible page text).
      // Comments are tolerated (html5lib parses them as after-after-body
      // comments without error).
      if (text.startsWith('<!--', i)) {
        const end = text.indexOf('-->', i + 4);
        advance(end === -1 ? n : end + 3);
        continue;
      }
      if (text[i] === '<') {
        const gt = text.indexOf('>', i);
        const j = gt === -1 ? n : gt + 1;
        push(line, 'content-after-html', `tag after </html>: ${summarize(text.slice(i, j))}`);
        advance(j);
        continue;
      }
      if (/\S/.test(text[i])) {
        // consume the whole run of non-whitespace as one violation
        let j = i;
        while (j < n && /\S/.test(text[j])) j++;
        push(line, 'content-after-html', `content after </html>: ${summarize(text.slice(i, Math.min(j, i + 40)))}`);
        advance(j);
        continue;
      }
      if (text[i] === '\n') { line++; i++; continue; }
      i++;
      continue;
    }

    const c = text[i];
    if (c === '\n') { line++; i++; continue; }
    if (c !== '<') { i++; continue; }

    // ── comments / doctype / bogus markup ──
    if (text.startsWith('<!--', i)) {
      i += 4; // comment start
      // abrupt forms: <!--> and <!---> (parse errors per spec)
      if (text.startsWith('>', i)) { push(line, 'comment-double-dash', 'abrupt comment close `<!-->`'); advance(i + 1); continue; }
      if (text.startsWith('->', i)) { push(line, 'comment-double-dash', 'abrupt comment close `<!--->`'); advance(i + 2); continue; }
      let j = i;
      let closed = false;
      while (j < n) {
        const dd = text.indexOf('--', j);
        if (dd === -1) { j = n; break; }
        const after = text[dd + 2];
        if (after === '>') { // clean close
          j = dd + 3; closed = true; break;
        }
        if (after === '!' && text[dd + 3] === '>') { // --!> close (error per spec)
          push(line, 'comment-double-dash', '`--!>` comment close');
          j = dd + 4; closed = true; break;
        }
        push(line, 'comment-double-dash', '`--` inside comment content');
        j = dd + 2; // continue scanning after this pair
      }
      if (!closed) push(line, 'comment-double-dash', 'unterminated comment (no `-->` before EOF)');
      advance(j);
      continue;
    }
    if (text.startsWith('<!', i) || text.startsWith('<?', i)) {
      // doctype / bogus comment: scan to '>'
      const gt = text.indexOf('>', i);
      advance(gt === -1 ? n : gt + 1);
      continue;
    }

    // ── end tag ──
    let m = /^<\/([a-zA-Z][a-zA-Z0-9]*)/.exec(text.slice(i, i + 80));
    if (m) {
      const tag = m[1].toLowerCase();
      let j = i + 2 + m[1].length;
      while (j < n && text[j] !== '>') j++;
      const end = j + 1;

      if (!RAWTEXT.has(tag) && !VOID.has(tag)) {
        if (tag === 'html' || tag === 'body') {
          // Closing body/html must not strand open elements above it.
          const depth = stack.findIndex((e) => e.tag === (tag === 'body' ? 'body' : 'html'));
          if (depth === -1) {
            push(line, 'stray-end-tag', `</${tag}> with no open <${tag}>`);
          } else {
            for (const e of stack.slice(depth + 1)) {
              if (tag === 'body') {
                push(e.line, 'unclosed-element', `<${e.tag}> opened here is never closed (auto-closed at </body>, line ${line})`);
              } else {
                push(e.line, 'unclosed-element', `<${e.tag}> opened here is never closed (auto-closed at </html>, line ${line})`);
              }
            }
            stack.length = depth;
            if (tag === 'body' && foreignDepth) foreignDepth = 0; // body close clears any svg misuse above
          }
          if (tag === 'body') sawBodyClose = true; else sawHtmlClose = true;
          advance(end);
          continue;
        }
        // find nearest open `tag`
        let idx = -1;
        for (let k = stack.length - 1; k >= 0; k--) {
          if (stack[k].tag === tag) { idx = k; break; }
        }
        if (idx === -1) {
          push(line, 'stray-end-tag', `</${tag}> with no open <${tag}>`);
        } else {
          for (const e of stack.slice(idx + 1)) {
            if (SPECIAL.has(e.tag)) {
              push(e.line, 'end-tag-too-early', `</${tag}> closes <${stack[idx].tag}> but <${e.tag}> (opened here) is still open`);
            }
            // non-special (span, a, em, custom, …) are silently implied-closed
          }
          for (const e of stack.slice(idx)) if (e.foreign) foreignDepth--;
          stack.length = idx;
        }
      }
      advance(end);
      continue;
    }

    // ── start tag ──
    m = /^<([a-zA-Z][a-zA-Z0-9]*)/.exec(text.slice(i, i + 80));
    if (m) {
      const tag = m[1].toLowerCase();
      // scan the tag body honouring quoted attribute values (onclick="a>b")
      let j = i + 1 + m[1].length;
      const seen = new Map(); // attr name → line (duplicate detection)
      let selfClosing = false;
      let afterQuotedGarbage = false;
      let garbageCh = '';
      while (j < n && text[j] !== '>') {
        const ch = text[j];
        if (ch === '"' || ch === "'") {
          const q = ch;
          j++;
          while (j < n && text[j] !== q) j++;
          if (j >= n) { push(line, 'unclosed-element', `unterminated attribute value in <${tag}> (EOF inside a ${q}quoted value)`); j = n; break; }
          j++;
          // after a closing quote only whitespace, `/` or `>` may follow.
          // Anything else = the value ended early (tool 74's `don\'t` backslash
          // escape: HTML has no backslash escapes, so '…don\' ends the value
          // and `t like…` parses as bogus attributes).
          if (j < n && text[j] !== '>' && !/\s/.test(text[j]) && text[j] !== '/') {
            afterQuotedGarbage = true;
            garbageCh = text[j];
          }
          continue;
        }
        if (/\s/.test(ch)) {
          j++;
          continue;
        }
        if (ch === '/') {
          if (text[j + 1] === '>') { selfClosing = true; j++; continue; }
          j++;
          continue;
        }
        // attribute name: up to whitespace, '=', '/', '>'
        let k = j;
        while (k < n && !/[\s=/>]/.test(text[k])) k++;
        const name = text.slice(j, k).toLowerCase();
        if (name) {
          // Duplicate-attribute only matters on tags whose attributes parsed
          // cleanly — once a quoted value has ended early (garbage after
          // quote), every following "attribute" is bogus token soup (tool 74's
          // `don\'t` cascade), and reporting duplicates for it is noise.
          if (afterQuotedGarbage) {
            // names still recorded so the first occurrence wins, no reports
          } else if (seen.has(name)) {
            push(line, 'duplicate-attribute', `attribute "${name}" repeated in <${tag}> (first at line ${seen.get(name)})`);
          } else seen.set(name, line);
          // skip `=value` if present
          let q = k;
          while (q < n && /\s/.test(text[q])) q++;
          if (text[q] === '=') {
            q++;
            while (q < n && /\s/.test(text[q])) q++;
            if (text[q] === '"' || text[q] === "'") { j = q; continue; } // value scan on next loop
            // unquoted value
            let v = q;
            while (v < n && !/[\s>]/.test(text[v])) v++;
            j = v;
            continue;
          }
        }
        j = k > j ? k : j + 1;
      }
      if (j >= n) { advance(n); continue; } // unterminated tag → EOF
      const end = j + 1; // past '>'

      if (afterQuotedGarbage) {
        push(line, 'attr-garbage-after-value',
          `<${tag}>: character ${JSON.stringify(garbageCh)} directly after a quoted attribute value — a quote ended the value early (backslash-escaped quote? unescaped same-quote inside the value?)`);
      }

      if (!VOID.has(tag)) {
        // implied end tags before opening
        if (foreignDepth === 0) {
          if (CLOSES_P.has(tag)) {
            while (stack.length && stack[stack.length - 1].tag === 'p') stack.pop();
          }
          if (tag === 'li') {
            while (stack.length && (stack[stack.length - 1].tag === 'p' || stack[stack.length - 1].tag === 'li')) stack.pop();
          }
          if (tag === 'dd' || tag === 'dt') {
            while (stack.length && ['p', 'dd', 'dt'].includes(stack[stack.length - 1].tag)) stack.pop();
          }
          if (tag === 'option') {
            while (stack.length && stack[stack.length - 1].tag === 'option') stack.pop();
          }
          if (tag === 'optgroup') {
            while (stack.length && ['option', 'optgroup'].includes(stack[stack.length - 1].tag)) stack.pop();
          }
          if (tag === 'tr') {
            while (stack.length && ['td', 'th', 'tr'].includes(stack[stack.length - 1].tag)) stack.pop();
          }
          if (tag === 'td' || tag === 'th') {
            while (stack.length && ['td', 'th', 'p'].includes(stack[stack.length - 1].tag)) stack.pop();
          }
          if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
            while (stack.length && ['td', 'th', 'tr'].includes(stack[stack.length - 1].tag)) stack.pop();
          }
        }

        if (RAWTEXT.has(tag)) {
          // Raw-text elements are self-contained frames: scan to the real end
          // tag so `<` inside JS/CSS is never parsed as markup, and never
          // push (their end tag is handled as a no-op by the end-tag branch).
          const closeRe = new RegExp(`</${tag}[\\s>/]`, 'gi');
          closeRe.lastIndex = end;
          const cm = closeRe.exec(text);
          if (!cm) {
            push(line, 'unclosed-element', `<${tag}> opened here has no </${tag}> before EOF`);
            advance(n);
            continue;
          }
          advance(cm.index);
          continue;
        }

        if (selfClosing && foreignDepth > 0) {
          // foreign content honours `/>`; nothing pushed
        } else if (selfClosing && FOREIGN_ROOTS.has(tag)) {
          // <svg … /> self-contained
        } else {
          stack.push({ tag, line, foreign: foreignDepth > 0 });
          if (FOREIGN_ROOTS.has(tag)) foreignDepth++;
        }
      }
      advance(end);
      continue;
    }

    // `<` that starts nothing (text like `a < b`) — plain text, no error
    i++;
  }

  // EOF: everything except implicitly-open html/body is an unclosed element
  for (const e of stack) {
    if (e.tag === 'html' || e.tag === 'body') continue;
    push(e.line, 'unclosed-element', `<${e.tag}> opened here is never closed (still open at EOF)`);
  }

  return violations;
}

function countNl(s, from, to) {
  let c = 0;
  for (let k = from; k < to && k < s.length; k++) if (s[k] === '\n') c++;
  return c;
}

function summarize(s) {
  return JSON.stringify(s.length > 40 ? s.slice(0, 37) + '…' : s);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main() {
  const pages = listShippedPages();
  let bad = 0;
  let total = 0;
  const PER_FILE_CAP = 25; // tool-69-style page soup can emit hundreds; keep output readable
  for (const rel of pages) {
    const abs = join(ROOT, rel);
    const text = readFileSync(abs, 'utf8');
    const v = checkStructure(text);
    if (v.length) {
      bad++;
      total += v.length;
      for (const { line, kind, detail } of v.slice(0, PER_FILE_CAP)) {
        console.error(`${rel}:${line}: ${kind} — ${detail}`);
      }
      if (v.length > PER_FILE_CAP) {
        console.error(`${rel}: … ${v.length - PER_FILE_CAP} more violation(s) suppressed`);
      }
    }
  }
  if (bad) {
    console.error(`\ncheck-html-structure: ${total} violation(s) across ${bad} of ${pages.length} pages.`);
    process.exit(1);
  }
  console.log(`check-html-structure: clean — 0 structural violations across ${pages.length} pages.`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('check-html-structure.mjs')) {
  main();
}
