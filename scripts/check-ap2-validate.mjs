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
 *   A5 UNREFERENCED-VALIDATOR   A `tools/`/`showcase/` file declares an `AP2Schema`
 *                           member matching `/valid/i` that is never referenced
 *                           ANYWHERE in the file (0 occurrences of `AP2Schema.<member>`
 *                           at all, so it never even reaches A1's checks). This is the
 *                           exact 03/12/14/16 defect: a schema copy-pasted from a
 *                           working tool's template, correct in shape, never wired to
 *                           a call site — dead code guarding nothing.
 *
 *   A6 NO-SCHEMA-NO-GUARD   A `tools/`/`showcase/` file declares NO `AP2Schema` at all,
 *                           writes a Policy Mandate `application/json` download, and
 *                           has no validation signal — no `errs`/`_ap2errs` guard, no
 *                           `.valid` check, no mandate-shape-field `if()`, no
 *                           `validat*()` call — anywhere in the file. The
 *                           advisor-prompt-composer defect shape.
 *
 *                           A5 and A6 are the AL-TOOLS-FIX-2 / AL-AP2-UNVALIDATED blind
 *                           spot: A1–A4 only ever fire on a file that references
 *                           `AP2Schema.<member>` at all, so a file that never calls a
 *                           validator of any shape sails through clean. Both are
 *                           deliberately WHOLE-FILE scoped, not per-function: this
 *                           suite legitimately builds a mandate in one function and
 *                           consumes it in another (`buildAP2Mandate()` validates and
 *                           returns `null` on failure; `exportAP2()` just checks
 *                           `if (!mandate) return`), so scoping to the export
 *                           function's own body false-positives on every tool using
 *                           that — very common — split. A6's guard-signal check also
 *                           skips (does not flag) any `<script>` block where mask()'s
 *                           quote/comment state machine didn't end back in `'code'`
 *                           (see `endsInCode()`) — a run of adjacent template literals
 *                           with `${}` interpolations has been observed to desync it on
 *                           at least one real file, and a block we can't trust the
 *                           tokenization of must not be treated as evidence either way.
 *
 *                           Scoped to `tools/` + `showcase/` only (AL-TOOLS-FIX-2's
 *                           67-file signal was tools/-only). `chaingraph/*.html` exports
 *                           a distinct, non-mandate `chaingraph_journey_bundle` artifact
 *                           (no `ap2_mandate_type`) — out of scope by construction.
 *                           `workflows/*.html` DOES emit real named-mandate-type Policy
 *                           Mandates via a `buildAP2()`/`dl()` pattern with no validator
 *                           anywhere in several files — a genuine same-shape defect,
 *                           confirmed while building this gate, but out of
 *                           AL-AP2-UNVALIDATED's scope (5 tool dirs) and left for its own
 *                           WU rather than silently widening this row or reddening CI on
 *                           files this row never touched.
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
 * Exit 0 = clean, exit 1 = one or more A1–A6 violations.
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

/**
 * Whether mask() plausibly tokenized `src` correctly: does its quote/comment state
 * machine end back in 'code'? A run of several adjacent template literals containing
 * `${...}` interpolations with their own nested quotes (mask() treats a whole backtick
 * span as opaque content, so it can't track `${}` as code) has been observed to desync
 * the tracked state on at least one real file in this suite, ending mid-string and
 * blanking everything after — silently, since mask() has no other output. Used only to
 * gate the A5 check (below), which is new and depends on scanning specific code past
 * where a desync could occur; A1–A4 predate this and are left as they are.
 */
function endsInCode(src) {
  const n = src.length;
  let i = 0, state = 'code';
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { state = 'block'; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { state = c; i++; continue; }
      i++; continue;
    }
    if (state === 'line') { if (c === '\n') state = 'code'; i++; continue; }
    if (state === 'block') { if (c === '*' && d === '/') { state = 'code'; i += 2; continue; } i++; continue; }
    if (c === '\\') { i += 2; continue; }
    if (c === state) { state = 'code'; i++; continue; }
    if (c === '\n' && state !== '`') { state = 'code'; i++; continue; }
    i++;
  }
  return state === 'code';
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
    blocks.push({ body, masked: mask(body), trusted: endsInCode(body), bodyStart, html });
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
  const referencedMembers = new Set();
  for (const b of blocks) {
    const callRe = /\bAP2Schema\s*\.\s*([A-Za-z_$][\w$]*)/g;
    let cm;
    while ((cm = callRe.exec(b.masked))) {
      const member = cm[1];
      const offset = cm.index;
      const abs = b.bodyStart + offset;
      const line = lineOf(abs);
      calls++;
      referencedMembers.add(member);
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

  // ── A5: tools/showcase file declares an AP2Schema validator member that is never
  //        referenced anywhere — the exact 03/12/14/16 defect shape (dead code
  //        guarding nothing, wherever in the file the export actually happens; this
  //        is deliberately NOT function-scoped to the export call, because this
  //        suite legitimately builds the mandate in one function and consumes it in
  //        another — e.g. `buildAP2Mandate()` validates and returns null on failure,
  //        `exportAP2()` just checks `if (!mandate) return`, and that split is
  //        correct as long as the builder really calls validate somewhere) ──
  const inScopeForA5 = rel.startsWith('tools/') || rel.startsWith('showcase/');
  if (inScopeForA5 && lit) {
    for (const member of lit.members) {
      // the VALIDATOR function member only (`validate`), not data members that
      // happen to contain "valid" too (`validMandateTypes`/`VALID_MANDATE_TYPES`),
      // which are legitimately referenced only via `this.<member>` from inside
      // `validate()` itself, never as `AP2Schema.<member>` — that isn't dead code
      if (!/^validate\w*$/i.test(member)) continue;
      if (!referencedMembers.has(member)) {
        findings.push({ code: 'A5', rel, line: lineOf(lit.block.bodyStart + lit.openIdx), member,
          detail: `AP2Schema.${member} is declared but never referenced anywhere in the file — `
            + 'dead code guarding nothing' });
      }
    }
  }

  // ── A6: tools/showcase file has NO AP2Schema at all, writes a Policy Mandate JSON
  //        download, but has no validation signal anywhere in the file. Whole-file
  //        (not per-function) scoped for the same reason as A5. The
  //        advisor-prompt-composer defect shape. ──
  if (inScopeForA5 && !lit) {
    const hasJsonExport = blocks.some(b => {
      const exportRe = /application\/json/gi;
      let em;
      while ((em = exportRe.exec(b.body))) {
        const nearby = b.body.slice(Math.max(0, em.index - 400), em.index + 200);
        if (/\b(?:createObjectURL|Blob\s*\(|\bdl\s*\(|downloadFile\s*\(|download\s*\()/.test(nearby)) return true;
      }
      return false;
    });
    if (hasJsonExport) {
      // signals mirroring AL-TOOLS-FIX-2's classifier, scanned across the WHOLE file
      // (all blocks) rather than one function — see the A5/A6 header note above
      const validated = blocks.some(b => {
        if (!b.trusted) return true; // mask() desync (see endsInCode()) — don't guess, don't flag
        const code = b.masked;
        if (/\bvalidat\w*\s*\(/i.test(code)) return true;
        if (/\bif\s*\([^)]*\.\s*valid\b/i.test(code)) return true;
        if (/\bif\s*\([^)]*\b(?:errs?|errors?|_ap2errs)\b[^)]*\)/i.test(code)) return true;
        // mandate-shape-field if() is the loosest signal — a tool can legitimately
        // check `if (!item.mandate_type)` for something UNRELATED to export gating
        // (e.g. warning on a pasted artifact, then continuing anyway). Only count it
        // when the guarded branch actually exits — `return`/`alert(...)return` within
        // the next ~200 chars — the way every real export guard in this suite does.
        const mreRe = /\bif\s*\([^)]*\b(?:chaingraph_version|ap2_mandate_type|mandate_type)\b[^)]*\)/gi;
        let mm;
        while ((mm = mreRe.exec(code))) {
          if (/\breturn\b/.test(code.slice(mm.index, mm.index + 400))) return true;
        }
        return false;
      });
      if (!validated) {
        findings.push({ code: 'A6', rel, line: 1, member: '(none)',
          detail: 'file writes a Policy Mandate application/json download but declares no AP2Schema '
            + 'and has no validation signal (errs/_ap2errs guard, .valid check, mandate-shape-field if(), '
            + 'or a validat*() call) anywhere in the file' });
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
