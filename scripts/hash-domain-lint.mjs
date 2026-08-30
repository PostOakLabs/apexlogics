#!/usr/bin/env node
// hash-domain-lint.mjs — HASH-DOMAIN DETERMINISM GATE (G1, AL-CI-HASHDOMAIN).
//
// The suite's execution_hash claims reproducibility: same inputs → same hash, forever.
// That claim breaks silently whenever a nondeterministic value (a clock read, a random
// number) reaches the hashed preimage — nothing else notices, because the tool still
// computes a valid-looking hash every time, just a DIFFERENT one on different days.
// Root-caused by 101-rap-vs-standard-decision-engine and 22-student-loan-repayment-optimizer:
// both derived a "forgiveness year" from `new Date().getFullYear()` and put it in the
// hashed payload/summary — same PSLF inputs hash differently across a Jan-1 boundary.
//
// Two hash-preimage construction patterns exist across the suite (see
// AL-AUDIT-COMPUTE-INTEGRITY.md §8.1) and this gate MUST handle both:
//
//   Pattern S (subtraction, ~154 tools) — a `_cgDomain` object is built by copying every
//   key of `payload` NOT present in an inline exclusion array:
//     const _cgDomain = {}; for (const _k in payload) {
//       if ([...].indexOf(_k) === -1) _cgDomain[_k] = payload[_k]; }
//   Domain = (keys ever assigned onto `payload`) MINUS (the exclusion array).
//
//   Pattern E (explicit, 14 tools) — apexHash(argA, argB) is called directly with no
//   exclusion list at all:
//     payload.execution_hash = await apexHash(_policy, _results);
//   Domain = (keys ever assigned onto argA) UNION (keys ever assigned onto argB).
//
// For every key found to enter the domain, this gate resolves its RHS expression and
// flags it if that expression — or a variable/property it references (traced up to 3
// hops, matching the transitive case the audit found: `pslf_forgive_year: src.forgiveYear`
// where `forgiveYear` was itself assigned from `new Date().getFullYear() + ...`) —
// contains one of: new Date(), Date.now(), .getFullYear(), Math.random(),
// crypto.randomUUID(), performance.now().
//
// A value merely ASSIGNED from the clock (e.g. a scratch `result.timestamp` stash that
// export re-projects around, never propagating it) is fine — only a value that actually
// reaches a domain key is a defect. This gate only inspects domain keys, which is what
// keeps it from flagging that convention.
//
// Usage: node scripts/hash-domain-lint.mjs   (exit 1 on any hit)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// Only the ROOT sources of nondeterminism are matched directly. `new Date()` with an
// argument (parsing a specific value — typically a user-entered date string) is NOT a
// root: it is deterministic given its input, and any `.getFullYear()`/`.toISOString()`/
// etc. called on it is just a deterministic accessor. Matching those accessor calls
// unconditionally (an earlier version of this gate did) false-positived on
// 110-espp-break-even-optimal-sell, which legitimately computes `.getFullYear()` on
// dates the USER entered — see AL-AUDIT-COMPUTE-INTEGRITY.md "false positives I killed"
// #5/#6. The bare no-arg `new Date()` — "give me right now" — is what actually varies
// run to run, and it's what A-1/A-2's `new Date().getFullYear()` both chained off of, so
// narrowing to no-args still catches that exact shape via the `new Date()` sub-match.
const CLOCK_RE = /\bnew\s+Date\s*\(\s*\)|\bDate\.now\s*\(|\bMath\.random\s*\(|\bcrypto\.randomUUID\s*\(|\bperformance\.now\s*\(/;

function htmlFiles() {
  const out = [];
  const toolsDir = join(REPO, 'tools');
  if (existsSync(toolsDir)) {
    for (const slug of readdirSync(toolsDir)) {
      const p = join(toolsDir, slug, 'index.html');
      if (existsSync(p) && statSync(p).isFile()) out.push(p);
    }
  }
  return out;
}

// Strip comments and string-literal noise is NOT done here — the CLOCK_RE patterns are
// code-shaped (call syntax) and don't false-positive on prose the way bare-word gates do;
// hash-lint.mjs's comment-strip precedent is for identifier-shaped false positives, which
// don't apply to `new Date(`-style call patterns.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// Pull ONLY the inline <script>...</script> bodies out of the HTML file — analyzing the
// raw HTML would (a) prepend stray markup text like "<script>" onto the first statement
// of each block, breaking the `^\s*(?:const|let|var)` anchor, and (b) risk false hits
// from `new Date(` appearing in HTML comments/attributes. Blocks are joined with `;\n` so
// statement splitting never bridges across two separate <script> tags.
function extractScripts(html) {
  const out = [];
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/.test(m[0].slice(0, m[0].indexOf('>') + 1))) continue; // external script, no body
    out.push(m[1]);
  }
  return out.join(';\n');
}

// Depth-aware statement splitter: splits `src` on top-level `;` (paren/bracket depth 0,
// outside strings/template literals). Needed because object-literal RHS expressions
// routinely span multiple lines. Deliberately does NOT count `{`/`}` toward depth —
// those delimit both block statements (whose semicolons ARE real statement ends,
// regardless of function/if/for nesting) and object literals (which never contain a
// real top-level `;`), so counting braces here would swallow every statement inside a
// function body into one blob instead of splitting them.
function splitStatements(src) {
  const out = [];
  let depth = 0, start = 0, inStr = null, i = 0;
  while (i < src.length) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i += 2; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ';' && depth === 0) {
      out.push(src.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  if (start < src.length) out.push(src.slice(start));
  return out;
}

// Extract top-level `key: value` pairs from an object-literal body (the text between
// the outermost `{` and its matching `}`, exclusive).
function splitObjectEntries(body) {
  const entries = [];
  let depth = 0, start = 0, inStr = null, i = 0;
  while (i < body.length) {
    const c = body[i];
    if (inStr) {
      if (c === '\\') { i += 2; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      entries.push(body.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  if (start < body.length) entries.push(body.slice(start));
  const out = [];
  for (const e of entries) {
    const m = e.match(/^\s*(?:['"`]?([\w$]+)['"`]?)\s*:\s*([\s\S]+)$/);
    if (m) out.push({ key: m[1], rhs: m[2].trim() });
  }
  return out;
}

// Given `src` and the index of an opening `{`, return the text strictly between it and
// its matching `}` (string-aware brace counting), or null if unbalanced. Used instead of
// a lazy regex like `\{([\s\S]*?)\n\s*\};` — that lazy match keeps scanning PAST an
// object literal that happens to be single-line (no `\n` before its own `};`) until it
// finds the next "\n...};" ANYWHERE later in the file, which can be a wholly unrelated
// object's closing brace, silently attributing that object's keys to the wrong identifier.
function braceBody(src, openIdx) {
  let depth = 0, inStr = null;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(openIdx + 1, i); }
  }
  return null;
}

// Build a defs map: name -> [rhs strings] for every `const/let/var NAME = RHS`,
// `IDENT.prop = RHS` (keyed by `prop`), and every object-literal `key: value` pair
// found anywhere in the (comment-stripped) source, keyed by the last path segment.
function buildDefs(src) {
  const defs = new Map();
  const add = (name, rhs) => {
    if (!name) return;
    if (!defs.has(name)) defs.set(name, []);
    defs.get(name).push(rhs);
  };
  for (const stmt of splitStatements(src)) {
    const declM = stmt.match(/^\s*(?:const|let|var)\s+([\w$]+)\s*=\s*([\s\S]+)$/);
    if (declM) {
      add(declM[1], declM[2]);
      const objM = declM[2].match(/^\s*\{([\s\S]*)\}\s*$/);
      if (objM) for (const { key, rhs } of splitObjectEntries(objM[1])) {
        add(key, rhs);
        // ALSO register under the compound `varName.key` — a bare `key` (registered
        // above) is only correct if nothing else in the file happens to reuse that same
        // property name in an unrelated object. When a reference is a dotted path
        // (`ap2.state_analysis`), isNondeterministic() prefers this compound key so
        // sibling fields of the SAME object (e.g. an unrelated `ap2.generated_at`) can't
        // leak a false positive onto `ap2.state_analysis`.
        add(`${declM[1]}.${key}`, rhs);
      }
      continue;
    }
    const assignM = stmt.match(/^\s*([\w$]+(?:\.[\w$]+)*)\s*=\s*([\s\S]+)$/);
    if (assignM) {
      const path = assignM[1].split('.');
      add(path[path.length - 1], assignM[2]);
      if (path.length > 1) add(assignM[1], assignM[2]); // compound `ident.prop` too
    }
  }
  return defs;
}

// Globals/keywords that are never worth chasing as a "definition" — chasing them just
// wastes hops and (for Math/Date/crypto/performance) would be redundant with CLOCK_RE.
const SKIP_IDENTS = new Set([
  'Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'crypto',
  'performance', 'console', 'window', 'document', 'null', 'undefined', 'true', 'false',
  'this', 'NaN', 'Infinity', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  // Ultra-generic scratch names (DOM-row-key / throwaway-var conventions in this codebase,
  // e.g. `const id = Date.now();` used purely as a UI list key) that BARE-NAME fallback
  // resolution (when a compound `object.field` lookup can't be resolved, e.g. a value
  // pulled from a runtime catalog lookup rather than a tracked object literal) would
  // otherwise collide with unrelated domain fields that happen to share the same trailing
  // segment name (`cert.id`, a catalog string id, is not `id`, a Date.now() row key).
  // Root-caused by 41-cert-renewal-forecaster's `cert_id: cs.cert.id` false-positiving
  // against its own unrelated `const id = Date.now();`.
  'id', 'ts',
]);

// Blank out string/template LITERAL TEXT (keeping `${...}` template interpolations,
// since those are real code) so identifier extraction below never treats prose words
// inside a quoted string as variable references. Without this, a purely-static
// agent_instructions string mentioning ordinary English words could coincidentally
// collide with an unrelated variable name elsewhere in the file (bare-name fallback)
// and get flagged for a clock read that has nothing to do with it.
function blankStringLiterals(s) {
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") {
      out += c; i++;
      while (i < s.length && s[i] !== c) { if (s[i] === '\\') i++; i++; }
      if (i < s.length) { out += c; i++; }
      continue;
    }
    if (c === '`') {
      out += c; i++;
      while (i < s.length && s[i] !== '`') {
        if (s[i] === '\\') { i += 2; continue; }
        if (s[i] === '$' && s[i + 1] === '{') {
          out += '${'; i += 2;
          let depth = 1;
          while (i < s.length && depth > 0) {
            if (s[i] === '{') depth++;
            else if (s[i] === '}') depth--;
            if (depth > 0) out += s[i];
            i++;
          }
          out += '}';
          continue;
        }
        i++;
      }
      if (i < s.length) { out += '`'; i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}

// Trace whether `rhs` is (or transitively resolves to, up to `hops` hops) a clock read.
// Direct match first; otherwise pull every identifier referenced in the expression
// (so a compound RHS like `currentYear + Math.ceil(x)` still chases `currentYear`,
// not just a bare single-identifier RHS) and recurse into each one's own definitions.
function isNondeterministic(rhs, defs, hops = 3, seen = new Set()) {
  const code = blankStringLiterals(rhs);
  if (CLOCK_RE.test(code)) return true;
  if (hops <= 0) return false;
  // Capture one-level dotted paths (`ap2.state_analysis`) as a SINGLE token, not two —
  // resolving via the compound `ident.prop` key (registered in buildDefs) keeps sibling
  // fields of the same object from cross-contaminating each other (an unrelated
  // `ap2.generated_at` must not make `ap2.state_analysis` look nondeterministic).
  const idents = new Set();
  for (const m of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)(?!\s*\()/g)) idents.add(m[1]);
  for (const token of idents) {
    if (seen.has(token)) continue;
    seen.add(token);
    const bare = token.includes('.') ? token.slice(token.lastIndexOf('.') + 1) : token;
    const compound = defs.get(token);
    if (compound === undefined && SKIP_IDENTS.has(bare)) continue; // only guards the ambiguous BARE fallback
    let candidates = compound !== undefined ? compound : (defs.get(bare) || []);
    if (compound === undefined) {
      // BARE fallback is only trustworthy when the name is unambiguous. A name like
      // `startYear` can legitimately have two unrelated definitions in the same file —
      // e.g. one auto-populates a form field's default from the clock, a separate one
      // re-reads the field's live (user-visible, user-editable) DOM value for the actual
      // computation — and only the SECOND one is what a domain key derived from it
      // actually resolves to at runtime. Flagging on "any candidate is nondeterministic"
      // would blame the field's value for a clock read that produced a DIFFERENT
      // variable entirely. Root-caused by 20-parent-college-roi-planner's `start_year`.
      const distinct = [...new Set(candidates)];
      if (distinct.length > 1) continue;
      candidates = distinct;
    }
    if (candidates.some(r => isNondeterministic(r, defs, hops - 1, seen))) return true;
  }
  return false;
}

// Pattern S: find `_cgDomain` subtraction sites, extract the exclusion array, and the
// set of keys ever assigned onto whatever object is being iterated. The container is
// USUALLY named `payload`, but tools with more than one mandate-building path in the
// same file (e.g. 22-student-loan-repayment-optimizer: a PSLF export using `mandate`
// and a main export using `ap2`) name it differently per site — the pattern is the
// `for (const _k in CONTAINER)` shape, not the literal name `payload`.
function findPatternS(src, defs) {
  const sites = [];
  // (?:const|let|var) on BOTH declarations — 09-job-search-roi-tracker (and others) use
  // the older `var _cgDomain = {}; for (var _k in mandate)` spelling, not `const`.
  const re = /(?:const|let|var)\s+_cgDomain\s*=\s*\{\s*\};\s*for\s*\(\s*(?:const|let|var)\s+_k\s+in\s+([\w$]+)\s*\)\s*\{\s*if\s*\(\s*\[([^\]]*)\]\s*\.indexOf\s*\(\s*_k\s*\)\s*===\s*-1\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const container = m[1];
    const exclusion = new Set([...m[2].matchAll(/["'`]([\w$]+)["'`]/g)].map(x => x[1]));
    sites.push({ container, exclusion, cut: m.index });
  }
  if (!sites.length) return null;
  const domainKeys = new Set();
  for (const site of sites) {
    const before = src.slice(0, site.cut);
    const keys = new Set();
    for (const m2 of before.matchAll(new RegExp(`\\b${site.container}\\.([\\w$]+)\\s*=`, 'g'))) keys.add(m2[1]);
    const declRe = new RegExp(`(?:const|let|var)\\s+${site.container}\\s*=\\s*\\{`, 'g');
    let dm;
    while ((dm = declRe.exec(before))) {
      const body = braceBody(before, dm.index + dm[0].length - 1);
      if (body !== null) for (const { key } of splitObjectEntries(body)) keys.add(key);
    }
    for (const k of keys) if (!site.exclusion.has(k)) domainKeys.add(k);
  }
  return [...domainKeys];
}

// Pattern E: find `apexHash(argA, argB)` calls, collect every key assigned onto
// argA / argB anywhere in the file.
function findPatternE(src) {
  const argNames = new Set();
  const re = /apexHash\s*\(\s*([\w$]+)\s*,\s*([\w$]+)\s*\)/g;
  let m, found = false;
  while ((m = re.exec(src))) {
    // Skip the FUNCTION DEFINITION itself (`async function apexHash(policy_parameters,
    // output_payload) {`) — its parameter names are not call-site argument identifiers,
    // and treating them as such pulls in every key of unrelated objects that happen to
    // share those generic names (e.g. an `output_payload:` key in a different literal).
    const prefix = src.slice(Math.max(0, m.index - 20), m.index);
    if (/function\s*$/.test(prefix)) continue;
    found = true; argNames.add(m[1]); argNames.add(m[2]);
  }
  if (!found) return null;
  const keys = new Set();
  for (const ident of argNames) {
    for (const m2 of src.matchAll(new RegExp(`\\b${ident}\\.([\\w$]+)\\s*=`, 'g'))) keys.add(m2[1]);
    const litRe = new RegExp(`(?:const|let|var)\\s+${ident}\\s*=\\s*\\{`, 'g');
    let lm;
    while ((lm = litRe.exec(src))) {
      const body = braceBody(src, lm.index + lm[0].length - 1);
      if (body !== null) for (const { key } of splitObjectEntries(body)) keys.add(key);
    }
  }
  return [...keys];
}

// A handful of tools (e.g. 113-pslf-qualifying-payment-counter) already fixed a known
// clock-in-summary defect not by removing the field, but by deep-cloning the domain and
// `delete`-ing the one offending nested key before hashing (keeping it in the visible
// export, dropping it only from the hashed preimage) — `delete IDENT.summary.forgiveness_date;`.
// Collect every such scrubbed `key.subkey` path so those specific subkeys are excluded
// when checking their parent domain key, instead of flagging the parent key wholesale.
function scrubbedSubpaths(src) {
  const out = new Set();
  for (const m of src.matchAll(/\bdelete\s+[\w$]+\.([\w$]+)\.([\w$]+)\s*;/g)) out.add(`${m[1]}.${m[2]}`);
  return out;
}

let hits = 0, checked = 0;
for (const f of htmlFiles()) {
  const raw = readFileSync(f, 'utf8');
  const src = stripComments(extractScripts(raw));
  const defs = buildDefs(src);
  const rel = f.replace(REPO, '.');

  const domainS = findPatternS(src, defs);
  const domainE = domainS === null ? findPatternE(src) : null;
  const domain = domainS !== null ? domainS : domainE;
  if (domain === null) continue; // no recognized hash-preimage construction; not this gate's scope
  checked++;
  const scrubbed = scrubbedSubpaths(src);

  for (const key of domain) {
    for (const rhs of (defs.get(key) || [])) {
      const trimmed = rhs.trim();
      const isObjLit = trimmed.startsWith('{') && trimmed.endsWith('}');
      if (isObjLit) {
        // Expand one level so (a) a scrubbed sibling (`delete X.key.subkey`) is excluded
        // precisely instead of hiding/flagging the whole parent key, and (b) a real hit
        // is reported against the SPECIFIC field, not a multi-hundred-char object blob.
        let flagged = false;
        for (const { key: subKey, rhs: subRhs } of splitObjectEntries(trimmed.slice(1, -1))) {
          if (scrubbed.has(`${key}.${subKey}`)) continue;
          if (isNondeterministic(subRhs, defs)) {
            console.error(`✗ ${rel} — domain key "${key}.${subKey}" traces to a clock/random read: ${subRhs.slice(0, 500).replace(/\s+/g, ' ')}`);
            hits++; flagged = true;
          }
        }
        if (flagged) break;
        continue;
      }
      if (isNondeterministic(rhs, defs)) {
        console.error(`✗ ${rel} — domain key "${key}" traces to a clock/random read: ${rhs.slice(0, 500).replace(/\s+/g, ' ')}`);
        hits++;
        break;
      }
    }
  }
}

if (hits) {
  console.error(`\n✗ hash-domain-lint: ${hits} nondeterministic domain key(s) across ${checked} tools checked. Fix before commit.`);
  process.exit(1);
}
console.log(`✓ hash-domain-lint: ${checked} tools with a resolvable hash-domain construction, 0 nondeterministic domain keys.`);
process.exit(0);
