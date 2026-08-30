#!/usr/bin/env node
/**
 * scripts/check-ap2-validate.mjs — AP2 validator-call integrity gate (AL-TOOLS-FIX-2).
 *
 * Every tool that emits a Policy Mandate validates it through an inline `AP2Schema`
 * object before writing the download. `AP2Schema` is defined per-file (there is no
 * <script src> in this suite), so the call site and the schema live in the same HTML
 * file — which means a typo'd member name is a *statically detectable* defect that
 * only ever shows up at runtime, as a TypeError, after the user clicks Export.
 *
 * That is exactly what shipped: five tools (84–88) called
 * `AP2Schema.vali_cgPrevalate(_cgPreval)` — a corrupt identifier that no schema has
 * ever declared. Each one threw `TypeError: ... is not a function`, so Export produced
 * no file and no error the user could see; the throw was uncaught. `check_tools.js`
 * (CG-25) never caught it because the code is syntactically perfect. Nothing else
 * asserted the name at all.
 *
 * This gate asserts two things, both statically and with no baseline and no exception
 * list:
 *
 *   A1 UNDECLARED-MEMBER    `AP2Schema.<member>` where <member> is not declared by the
 *                           schema literal in that file (nor assigned onto it). Always
 *                           a TypeError at Export time. This is the 84–88 defect class.
 *
 *   A2 DEAD-GUARD           The validator returns `{valid: ...}` and never throws, but
 *                           the call site only tests the result's *truthiness*
 *                           (`if (res)`). A non-null object is always truthy, so the
 *                           guard can never fire — validation is decorative.
 *
 *   A3 TRIPPING-GUARD       The validator returns an array or a boolean, but the call
 *                           site reads `res.valid` / `res.error` / `res.ok`. Those are
 *                           `undefined` on an array/plain boolean, so `!res.valid` is
 *                           always true and Export is blocked for every user, always.
 *
 *   A4 UNRECOGNISED-SHAPE   The validator's return shape can't be classified into any
 *                           of OBJECT / ARRAY / THROWS / BOOL. Recognised BOOL forms
 *                           include an explicit `return true/false`, an explicit
 *                           `return <expr>;` (error-string-or-null, `a && b && c`
 *                           chains, ternaries — anything only sensibly tested for
 *                           truthiness), and the implicit return of a brace-less
 *                           concise arrow (`validate: p => p.chaingraph_version && ...`).
 *                           A file that still trips this is a real gap in the gate, not
 *                           evidence of a tool defect — fix the gate, don't touch the
 *                           tool on an A4 alone.
 *
 * Deliberately NOT flagged (see the AL-TOOLS-FIX-2 retraction — do not "fix" these):
 *
 *   - A THROWING validator is never flagged, whatever the consumption. Ten tools
 *     (122–127, 130–133) use `try { AP2Schema.validate(x) } catch (e) { ... }` and that
 *     is CORRECT: those schemas signal failure with `throw new Error(...)` and reach
 *     `return true` only on the success path, so the catch is the intended failure
 *     channel. An earlier draft of this work unit misread them as decorative because
 *     it only looked for `return true`. They are not. No shape check is applied to a
 *     validator that throws.
 *
 * Usage: node scripts/check-ap2-validate.mjs
 * Exit 0 = clean, exit 1 = one or more A1/A2/A3/A4 violations.
 *
 * The page surface is DERIVED by walking the repo root (same rule as check_tools.js
 * after AL-JSGATE-SHOWCASE) rather than hand-naming directories, so a new content
 * directory is covered by default instead of needing another scope patch.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Non-page / non-shipped directories — must never be walked for pages.
const EXCLUDE_DIRS = new Set(['scripts', 'node_modules', '.git', '.github', 'ARCHIVE', 'assets']);
const JS_TYPES = ['', 'text/javascript', 'application/javascript', 'module', 'text/babel'];

// ── surface ─────────────────────────────────────────────────────────────────
function listDirHtml(dirName) {
  const dir = join(ROOT, dirName);
  const ents = readdirSync(dir, { withFileTypes: true });
  const nested = ents
    .filter(e => e.isDirectory() && existsSync(join(dir, e.name, 'index.html')))
    .map(e => [join(dirName, e.name), join(dir, e.name, 'index.html')]);
  const flat = ents
    .filter(e => e.isFile() && e.name.endsWith('.html'))
    .map(e => [join(dirName, e.name), join(dir, e.name)]);
  return nested.concat(flat);
}

function listPages() {
  const rootEnts = readdirSync(ROOT, { withFileTypes: true });
  const rootHtml = rootEnts
    .filter(e => e.isFile() && e.name.endsWith('.html'))
    .map(e => [e.name, join(ROOT, e.name)]);
  const subDirPages = rootEnts
    .filter(e => e.isDirectory() && !EXCLUDE_DIRS.has(e.name) && !e.name.startsWith('.'))
    .flatMap(e => listDirHtml(e.name));
  return rootHtml.concat(subDirPages).sort((a, b) => a[0].localeCompare(b[0]));
}

// ── masking ─────────────────────────────────────────────────────────────────
/**
 * Blank out comments and string/template-literal *contents*, preserving length and
 * all offsets, so every regex below runs on code only and every match still carries
 * a true offset into the original file (line numbers stay correct).
 *
 * A schema name mentioned in prose ("call AP2Schema.validate before export") must not
 * register as a call, and a `//` or `{` inside a string must not break brace matching.
 */
function mask(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  let state = 'code'; // 'code' | 'line' | 'block' | quote char
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { out[i] = out[i + 1] = ' '; state = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { out[i] = out[i + 1] = ' '; state = 'block'; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { state = c; i++; continue; }
      i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') state = 'code'; else out[i] = ' ';
      i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && d === '/') { out[i] = out[i + 1] = ' '; state = 'code'; i += 2; continue; }
      if (c !== '\n') out[i] = ' ';
      i++; continue;
    }
    // inside a string/template literal — blank the content, keep the delimiters
    if (c === '\\') { out[i] = ' '; if (i + 1 < n) out[i + 1] = ' '; i += 2; continue; }
    if (c === state) { state = 'code'; i++; continue; }
    if (c === '\n' && state !== '`') { state = 'code'; i++; continue; } // unterminated
    if (c !== '\n') out[i] = ' ';
    i++;
  }
  return out.join('');
}

// ── brace / extent helpers (all run on masked code: no strings, no comments) ─
function matchBrace(code, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Top-level members of an object literal whose opening brace is at `openIdx`. */
function literalMembers(code, openIdx) {
  const close = matchBrace(code, openIdx);
  if (close === -1) return { members: [], close: -1 };
  const members = [];
  let depth = 0;
  let i = openIdx;
  while (i < close) {
    const c = code[i];
    if (c === '{' || c === '[' || c === '(') { depth++; i++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; i++; continue; }
    if (depth === 1 && /[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < close && /[\w$]/.test(code[j])) j++;
      const name = code.slice(i, j);
      let k = j;
      while (k < close && /\s/.test(code[k])) k++;
      if (code[k] === ':' || code[k] === '(') members.push(name);
      i = j;
      continue;
    }
    i++;
  }
  return { members, close };
}

/**
 * Body extent of a member function declared inside the literal, or null.
 * Returns { start, end, isExpr } — `isExpr` marks a brace-less concise arrow
 * (`validate: p => p.chaingraph_version && p.al_id`), whose "body" is a single
 * expression terminated by `;`, `}` or `)` rather than by braces.
 */
function memberFnBody(code, fromIdx, name) {
  const esc = name.replace(/[$]/g, '\\$');
  const pats = [
    // method shorthand + function/arrow property:  validate (o) {  /  validate: (o) => {
    new RegExp('\\b' + esc + '\\s*:?\\s*(?:function\\s*)?(?:\\([^()]*\\)|[A-Za-z_$][\\w$]*)?\\s*(?:=>)?\\s*\\{'),
    // plain method:  validate(o) {
    new RegExp('\\b' + esc + '\\s*\\([^()]*\\)\\s*\\{'),
  ];
  let best = null;
  for (const re of pats) {
    const m = re.exec(code.slice(fromIdx));
    if (!m) continue;
    const brace = fromIdx + m.index + m[0].length - 1;
    if (best === null || brace < best) best = brace;
  }
  if (best !== null && code[best] === '{') {
    const close = matchBrace(code, best);
    if (close !== -1) return { start: best, end: close, isExpr: false };
  }

  // brace-less concise arrow:  validate: p => expr
  const arrowRe = new RegExp('\\b' + esc + '\\s*:?\\s*(?:\\([^()]*\\)|[A-Za-z_$][\\w$]*)?\\s*=>\\s*');
  const am = arrowRe.exec(code.slice(fromIdx));
  if (am) {
    const i = fromIdx + am.index + am[0].length;
    let depth = 0, j = i;
    for (; j < code.length; j++) {
      const c = code[j];
      if (c === '(' || c === '[') { depth++; continue; }
      if (c === '{') break;                                  // block body — handled above
      if ((c === ')' || c === ']') && depth === 0) break;
      if (c === ')' || c === ']') { depth--; continue; }
      if (depth === 0 && (c === ';' || c === '}')) break;
    }
    if (j > i) return { start: i, end: j - 1, isExpr: true };
  }
  return null;
}

/**
 * What a validator returns, and whether it can throw. `isExpr` marks a brace-less
 * concise arrow (`validate: p => p.chaingraph_version && ...`) whose whole body IS
 * the return value, with no `return` keyword to match on.
 */
function classifyShape(body, isExpr) {
  if (!body) return 'UNKNOWN';
  const throws = /\bthrow\b/.test(body);
  // "return { valid: ... }" — tolerate a nested brace or two before the key.
  const returnsObjWithValid = /return\s*\{[^}]*\b(?:valid|ok)\s*:/.test(body);
  const returnsArrayLike = /return\s*\[/.test(body) || /\b(?:errors|errs|issues|msgs)\s*\.\s*push\s*\(/.test(body);
  // Truthy-return family: an explicit `return <expr>;` that isn't the object/array
  // shapes above (booleans, error-string-or-null, `a && b && c` chains, ternaries
  // — anything a caller can only sensibly test for truthiness), OR the implicit
  // return of a brace-less arrow, which is the same contract with no `return` token.
  const returnsTruthy = isExpr || /\breturn\s+[^;{}]+[;}]/.test(body);

  if (returnsObjWithValid) return 'OBJECT';
  if (returnsArrayLike) return 'ARRAY';
  if (throws) return 'THROWS'; // throws and no object/array return → throw is the channel
  if (returnsTruthy) return 'BOOL';
  return 'UNKNOWN';
}

// ── main scan ───────────────────────────────────────────────────────────────
const findings = [];
let pages = 0, schemas = 0, calls = 0;

for (const [name, file] of listPages()) {
  pages++;
  const html = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file).replace(/\\/g, '/');

  // 1. collect every inline JS block (same rules as check_tools.js)
  const blocks = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '', body = m[2];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const tm = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
    if (!JS_TYPES.includes(tm ? tm[1].toLowerCase() : '')) continue;
    if (!body.trim()) continue;
    const bodyStart = m.index + m[0].length - body.length; // absolute offset in html
    blocks.push({ body, masked: mask(body), bodyStart, html });
  }
  if (!blocks.length) continue;

  const lineOf = (absOffset) => html.slice(0, absOffset).split('\n').length;

  // 2. locate the AP2Schema literal anywhere in the file (schema and call site can
  //    sit in different <script> blocks) and collect its declared members.
  let lit = null; // { block, openIdx, close, members:Set }
  for (const b of blocks) {
    const dm = /(?:\b(?:const|let|var)\s+)?\bAP2Schema\s*=\s*\{/.exec(b.masked);
    if (!dm) continue;
    const openIdx = dm.index + dm[0].length - 1;
    const { members, close } = literalMembers(b.masked, openIdx);
    if (close === -1) continue;
    lit = { block: b, openIdx, close, members: new Set(members) };
    schemas++;
    break;
  }

  // Members added after the fact: `AP2Schema.foo = function () {...}`
  if (lit) {
    for (const b of blocks) {
      const re2 = /\bAP2Schema\s*\.\s*([A-Za-z_$][\w$]*)\s*=/g;
      let mm;
      while ((mm = re2.exec(b.masked))) lit.members.add(mm[1]);
    }
  }

  // 3. every `AP2Schema.<member>` reference
  for (const b of blocks) {
    const callRe = /\bAP2Schema\s*\.\s*([A-Za-z_$][\w$]*)/g;
    let cm;
    while ((cm = callRe.exec(b.masked))) {
      const member = cm[1];
      const offset = cm.index;
      const abs = b.bodyStart + offset;
      const line = lineOf(abs);
      calls++;
      const isCall = /^\s*\(/.test(b.masked.slice(offset + cm[0].length));

      // ── A1: undeclared member ────────────────────────────────────────────
      if (!lit) {
        findings.push({ code: 'A1', rel, line, member,
          detail: 'AP2Schema.' + member + ' referenced but no AP2Schema literal found in this file' });
        continue;
      }
      if (!lit.members.has(member)) {
        findings.push({ code: 'A1', rel, line, member,
          detail: 'AP2Schema.' + member + ' is not declared by this file\'s AP2Schema (declared: '
            + ([...lit.members].join(', ') || 'none') + ')' });
        continue;
      }
      if (!isCall) continue;          // property read, not an invocation
      if (!/valid/i.test(member)) continue; // only validator members have a contract

      // ── shape ───────────────────────────────────────────────────────────
      const fn = memberFnBody(lit.block.masked, lit.openIdx, member);
      const fnBody = fn ? lit.block.masked.slice(fn.start, fn.end + 1) : null;
      const shape = classifyShape(fnBody, fn ? fn.isExpr : false);
      if (shape === 'UNKNOWN') {
        findings.push({ code: 'A4', rel, line, member,
          detail: (fn ? 'validator shape not recognised statically' : 'could not locate the function body')
            + (fnBody ? ' :: ' + fnBody.replace(/\s+/g, ' ').slice(0, 160) : '') });
        continue;
      }
      if (shape === 'THROWS') continue; // correct by definition — see header

      // ── consumption ─────────────────────────────────────────────────────
      const code = b.masked;
      const back = code.slice(Math.max(0, offset - 200), offset);
      const asg = /(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*$/.exec(back);
      const v = asg ? asg[1] : null;
      const esc = (s) => s.replace(/[$]/g, '\\$');

      const readsValid = v
        ? new RegExp('\\b' + esc(v) + '\\s*\\.\\s*(?:valid|ok|error)\\b').test(code)
        : /\bAP2Schema\s*\.\s*validate\s*\([^()]*\)\s*\.\s*(?:valid|ok|error)\b/.test(code);
      const readsLength = v
        ? new RegExp('\\b' + esc(v) + '\\s*\\.\\s*length\\b').test(code)
        : false;
      const bareTruthy = v
        ? new RegExp('(?:if|\\!)\\s*\\(?\\s*\\!?\\s*' + esc(v) + '\\s*(?:\\)|&&|\\|\\||;)').test(code)
        : /\bif\s*\(\s*\!?\s*AP2Schema\s*\.\s*validate\s*\(/.test(code);

      if (shape === 'OBJECT' && bareTruthy && !readsValid && !readsLength) {
        findings.push({ code: 'A2', rel, line, member,
          detail: 'validator returns {valid:...} and never throws, but the call site only tests '
            + `\`${v}\` for truthiness — a non-null object is always truthy, so this guard can never fire` });
      } else if ((shape === 'ARRAY' || shape === 'BOOL') && readsValid && !readsLength) {
        findings.push({ code: 'A3', rel, line, member,
          detail: `validator returns ${shape === 'ARRAY' ? 'an array' : 'a boolean'}, but the call site reads `
            + `\`${v}.valid\`/\`.error\` — undefined, so \`!${v}.valid\` is always true and Export is blocked for everyone` });
      }
    }
  }
}

if (findings.length) {
  console.error(`\ncheck-ap2-validate: ${findings.length} violation(s):\n`);
  for (const f of findings) {
    console.error(`  ✗ ${f.code} ${f.rel}:${f.line} — AP2Schema.${f.member} — ${f.detail}`);
  }
  console.error('\nNo baseline, no exception list (AL-TOOLS-FIX-2). Fix the call site or the schema.');
  process.exit(1);
}
console.log(`✓ check-ap2-validate: ${pages} pages, ${schemas} AP2Schema literals, ${calls} member references — clean.`);
process.exit(0);
