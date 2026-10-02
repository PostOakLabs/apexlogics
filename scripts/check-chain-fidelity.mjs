#!/usr/bin/env node
/**
 * scripts/check-chain-fidelity.mjs — workflow-page ↔ chain fidelity gate
 * (AL-CHAIN-FIDELITY, AX-1).
 *
 * check-chaingraph-parity.mjs proves the site copy and the worker copy agree
 * with EACH OTHER; check-chaingraph-validity.mjs proves every step tool_id
 * resolves somewhere. Neither checks either copy against what a reader is
 * actually told on the workflow pages. That let 26 of 40 workflows disagree
 * (22 chains carrying wrong steps, 4 workflow pages with no chain at all) while
 * every existing gate stayed green — find_chain/run_chain handed agents the
 * wrong journey for most workflows (measured 2026-10-01, memorial §3 AX-1).
 *
 * This gate reads the SITE copy (chaingraph/chaingraph.json, canonical) and,
 * for every published workflow page (workflows/<slug>.html), extracts the
 * ordered tool links a reader sees and compares them with the chain of the
 * same name:
 *
 *   1. every workflow page must have a chain (chaingraph.chains[].name);
 *   2. the chain's step tool_id sequence must EXACTLY equal the page's ordered
 *      tool links;
 *   3. one narrow, named tolerance: a page whose step sections repeat the
 *      previous step's full-tool anchor exactly once (mba-ding-comeback-
 *      planner.html — its step-2 section repeats step-1's anchor; recorded as
 *      page drift, out of AL-CHAIN-FIDELITY's fence) is accepted iff deleting
 *      that ONE duplicated anchor makes the sequences equal. Order inversions,
 *      missing tools, extra tools, and duplicated steps on the CHAIN side all
 *      stay failures — a subsequence alone is not enough.
 *
 * Page link extraction covers the four markup shapes the 40 pages use:
 *   - chips:        <a href="../tools/<slug>/index.html" class="tool-link">
 *   - step CTAs:    <a href="../tools/<slug>/index.html" class="step-launch">
 *   - step refs:    Full tool(s): <a href="../tools/<slug>/index.html" ...>
 *   - pill grids:   <a href="/tools/<slug>/" class="tls-pill">
 * The bottom "tls-card" grid (a repeat of the same tools) is excluded.
 *
 * Non-workflow-named chains (the six cardless chains: grad-mba-decision,
 * student-loan-repayment-decision, workforce-pell-eligibility-path,
 * grad-loan-gap-funding-path, showcase-hash-seeded-art,
 * showcase-arg-puzzle-gates) are out of scope by design — they have no
 * workflow page to be faithful to.
 *
 * Blocking: exit 1 on any non-exact workflow chain, else 0.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHAINGRAPH_PATH = join(ROOT, 'chaingraph', 'chaingraph.json');
const WORKFLOWS_DIR = join(ROOT, 'workflows');

const chaingraph = JSON.parse(readFileSync(CHAINGRAPH_PATH, 'utf8'));
const chainBySlug = new Map((chaingraph.chains ?? []).map((c) => [c.name, c]));

// Ordered tool slugs a reader sees on one workflow page. The bottom "tls-card"
// grid repeats the same tools as navigation — excluded so it cannot mask (or
// manufacture) a step-order disagreement.
function extractPageLinks(html) {
  const out = [];
  const re = /<a\s+href="(?:\.\.|https:\/\/apexlogics\.org)?\/?tools\/([^/"']+?)(?:\/index\.html|\/)"([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[2].includes('tls-card')) continue;
    out.push(m[1]);
  }
  return out;
}

// Tolerance (rule 3 above): pageLinks === chainSteps after deleting exactly one
// page link that duplicates its immediate predecessor.
function toleratedDuplication(chainSteps, pageLinks) {
  if (pageLinks.length !== chainSteps.length + 1) return false;
  for (let i = 0; i + 1 < pageLinks.length; i++) {
    if (pageLinks[i] !== pageLinks[i + 1]) continue;
    const deleted = pageLinks.slice(0, i + 1).concat(pageLinks.slice(i + 2));
    if (deleted.length === chainSteps.length && deleted.every((x, j) => x === chainSteps[j])) return true;
  }
  return false;
}

const failures = [];
let exact = 0;
let tolerated = 0;
const pages = readdirSync(WORKFLOWS_DIR)
  .filter((f) => f.endsWith('.html') && f !== 'index.html')
  .sort();

for (const page of pages) {
  const slug = page.replace(/\.html$/, '');
  const chain = chainBySlug.get(slug);
  const pageLinks = extractPageLinks(readFileSync(join(WORKFLOWS_DIR, page), 'utf8'));
  if (!chain) {
    failures.push(`workflow page "${slug}.html" has no chain of the same name in chaingraph.chains[]`);
    continue;
  }
  if (!pageLinks.length) {
    failures.push(`workflow page "${slug}.html" exposes no tool links (extraction found nothing) — cannot verify chain "${slug}"`);
    continue;
  }
  const chainSteps = (chain.steps ?? []).map((s) => s.tool_id);
  if (chainSteps.length === pageLinks.length && chainSteps.every((x, i) => x === pageLinks[i])) {
    exact++;
    continue;
  }
  if (toleratedDuplication(chainSteps, pageLinks)) {
    tolerated++;
    console.log(`· ${slug}: page repeats one full-tool anchor (page drift, out of fence) — chain matches after deleting the duplicate`);
    continue;
  }
  failures.push(`chain "${slug}" is non-exact vs its workflow page:\n      chain: [${chainSteps.join(', ')}]\n      page : [${pageLinks.join(', ')}]`);
}

const workflowChains = (chaingraph.chains ?? []).filter((c) => pages.some((p) => p.replace(/\.html$/, '') === c.name)).length;

if (failures.length) {
  console.error(`check-chain-fidelity: ${failures.length} non-exact workflow chain(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check-chain-fidelity: OK — 0 non-exact workflow chains; ${exact} exact, ${tolerableText(tolerated)}, ${workflowChains} workflow-named chains across ${pages.length} pages.`);

function tolerableText(t) {
  return t === 0 ? '0 tolerated page-drift' : `${t} tolerated page-drift (named above)`;
}
