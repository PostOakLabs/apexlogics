#!/usr/bin/env node
/**
 * scripts/check-chaingraph-parity.mjs — chaingraph.json cross-copy drift gate
 * (AL-CHAINGRAPH-SYNC).
 *
 * Two copies of chaingraph.json are published: the site's (this repo,
 * repo/chaingraph/chaingraph.json — CANONICAL, hand-maintained, linked from
 * every tool/showcase footer's Data & Artifacts column) and the worker's
 * (apexlogics-mcp-worker/data/chaingraph/chaingraph.json — served over MCP,
 * ported from the site copy by hand). AL-CHAIN-ALIAS (worker PR #22) and
 * AL-CHAINGRAPH-SYNC (site) both had to resolve the same 7 dead chain
 * tool_id references independently because nothing checked the two stayed
 * in sync. This gate compares the chain step tool_id sequence, per chain
 * name, between this repo's copy and the worker repo's copy (fetched from
 * GitHub raw — no cross-repo checkout needed) and fails if they disagree.
 *
 * Not full-file parity: unrelated fields (e.g. an already-renamed tool slug
 * that hasn't been back-ported to the worker copy yet) are out of scope —
 * only the "does an agent get the same journey" surface is checked. That
 * surface is now TWO structures, not one: chains[].steps[].tool_id AND
 * journeys[].sub_journeys[].nodes[] (AL-SUBJOURNEY-REFS, 2026-08-30 — the
 * same 7-dead-ref defect recurred a third time specifically because the
 * first two fixes only ever covered chains[], never sub_journeys[]).
 * Both are compared below.
 *
 * Network-dependent: skips (warns, exit 0) rather than fails if the worker
 * repo's raw file can't be fetched, so a GitHub outage doesn't block deploy.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const WORKER_RAW_URL =
  'https://raw.githubusercontent.com/PostOakLabs/apexlogics-mcp-worker/master/data/chaingraph/chaingraph.json';

function chainStepMap(doc) {
  const map = {};
  for (const chain of doc.chains ?? []) {
    map[chain.name] = (chain.steps ?? []).map(s => s.tool_id);
  }
  return map;
}

// Walks journeys[].themes[].sub_journeys[] and journeys[].sub_journeys[]
// (both shapes appear — some journeys group sub_journeys under themes,
// others list them flat) and maps sub_journey id -> its nodes[] array.
function subJourneyNodeMap(doc) {
  const map = {};
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o && typeof o === 'object') {
      if (Array.isArray(o.nodes) && o.nodes.every(x => typeof x === 'string') && typeof o.id === 'string') {
        map[o.id] = o.nodes;
      }
      for (const k of Object.keys(o)) walk(o[k]);
    }
  };
  walk(doc.journeys ?? []);
  return map;
}

async function main() {
  const site = JSON.parse(
    readFileSync(resolve(ROOT, 'chaingraph/chaingraph.json'), 'utf8')
  );
  const siteMap = chainStepMap(site);
  const siteSubJourneyMap = subJourneyNodeMap(site);

  let workerDoc;
  try {
    const res = await fetch(WORKER_RAW_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    workerDoc = await res.json();
  } catch (err) {
    // Non-blocking by design (a GitHub outage shouldn't block deploy), but a
    // skip must never read the same as a pass — AL-GATE-HONESTY found this
    // catch printing a message indistinguishable from the real "OK" line.
    // ::warning:: is a GitHub Actions annotation — it marks the step with a
    // visible warning badge instead of a plain green check, even on exit 0.
    console.log(`::warning::check-chaingraph-parity: SKIPPED — could not fetch worker copy (${err.message}). Site-vs-worker chaingraph drift was NOT checked this run.`);
    console.log(`check-chaingraph-parity: SKIPPED (network) — not a pass, not a fail. See warning above.`);
    process.exit(0);
  }

  const workerMap = chainStepMap(workerDoc);
  const workerSubJourneyMap = subJourneyNodeMap(workerDoc);
  const names = new Set([...Object.keys(siteMap), ...Object.keys(workerMap)]);
  const subJourneyIds = new Set([...Object.keys(siteSubJourneyMap), ...Object.keys(workerSubJourneyMap)]);
  const mismatches = [];

  for (const name of names) {
    const a = siteMap[name];
    const b = workerMap[name];
    if (!a) { mismatches.push(`chain "${name}": present in worker copy only`); continue; }
    if (!b) { mismatches.push(`chain "${name}": present in site copy only`); continue; }
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      mismatches.push(`chain "${name}": site=[${a.join(', ')}] worker=[${b.join(', ')}]`);
    }
  }

  for (const id of subJourneyIds) {
    const a = siteSubJourneyMap[id];
    const b = workerSubJourneyMap[id];
    if (!a) { mismatches.push(`sub_journey "${id}": present in worker copy only`); continue; }
    if (!b) { mismatches.push(`sub_journey "${id}": present in site copy only`); continue; }
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      mismatches.push(`sub_journey "${id}": site=[${a.join(', ')}] worker=[${b.join(', ')}]`);
    }
  }

  if (mismatches.length) {
    console.error(`check-chaingraph-parity: ${mismatches.length} chain(s)/sub-journey(s) disagree between site and worker copies:`);
    for (const m of mismatches) console.error(`  - ${m}`);
    console.error('\nSite copy (repo/chaingraph/chaingraph.json) is canonical — port fixes to the worker copy (apexlogics-mcp-worker/data/chaingraph/chaingraph.json) to resolve.');
    process.exit(1);
  }

  console.log(`check-chaingraph-parity: OK — ${names.size} chains + ${subJourneyIds.size} sub-journeys agree between site and worker copies.`);
}

main();
