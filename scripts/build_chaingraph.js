#!/usr/bin/env node
// build_chaingraph.js — generate chaingraph.json nodes[]
// from 145 tool manifests + CONTRACT §6.3 handoff map.
// Run: cd repo && node scripts/build_chaingraph.js
// Sandbox: read-only (git show); real writes happen via this script on Windows.

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Paths (relative to repo root where script runs) ─────────────────────────
const ROOT            = path.resolve(__dirname, '..');
const TOOLS_DIR       = path.join(ROOT, 'tools');
const GRAPH_FILE      = path.join(ROOT, 'chaingraph', 'chaingraph.json');

// ── §6.3 handoff map seeds (contract-canonical; supplements manifest fields) ─
// Key = al_id (string); value = array of al_ids this tool FEEDS.
const FEEDS_SEED = {
  'AL-02':    ['AL-26'],
  'AL-03':    ['AL-26', 'AL-02'],
  'AL-06+16': [],                      // resolved combined tool
  'AL-11':    ['AL-02', 'AL-07'],
  'AL-17':    ['AL-26'],
  'AL-18':    ['AL-03', 'AL-20'],
  'AL-08+14': ['AL-28'],
  'AL-24':    ['AL-28'],
  'AL-25':    ['AL-27'],
  'AL-27':    ['AL-28', 'AL-25'],
};

// Retired/absorbed AL-IDs — skip if encountered (no manifest should exist).
const RETIRED_AL_IDS = new Set(['AL-60', 'AL-15', 'AL-19', 'AL-21', 'AL-58']);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Merge two arrays deduplicated, preserving order. */
function mergeUnique(a = [], b = []) {
  const seen = new Set(a);
  const out  = [...a];
  for (const x of b) { if (!seen.has(x)) { seen.add(x); out.push(x); } }
  return out;
}

/** Derive the consumes edges for an al_id from the inverse of FEEDS_SEED. */
function buildConsumedByMap() {
  const map = {};
  for (const [fromId, toIds] of Object.entries(FEEDS_SEED)) {
    for (const toId of toIds) {
      if (!map[toId]) map[toId] = [];
      if (!map[toId].includes(fromId)) map[toId].push(fromId);
    }
  }
  return map;
}

/** Read a manifest.json; return null on error (bad JSON or missing). */
function readManifest(toolDir) {
  const p = path.join(TOOLS_DIR, toolDir, 'manifest.json');
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`  WARN: could not parse ${p}: ${e.message}`);
    return null;
  }
}

/** Best-effort: extract mcp_name from various manifest shapes. */
function getMcpName(m) {
  return (
    m.mcp_tool_definition?.name ||
    m.mcp_name ||
    m.name ||
    null
  );
}

/** Extract the first mandate type emitted; handles both old (array) and new shapes. */
function getPrimaryMandateType(m) {
  if (Array.isArray(m.ap2_mandate_types) && m.ap2_mandate_types.length > 0) {
    return m.ap2_mandate_types[0];
  }
  if (typeof m.mandate_type === 'string') return m.mandate_type;
  return null;
}

/** Normalize tool URL — prefer manifest.tool_url, fall back to computed. */
function getUrl(m) {
  if (m.tool_url && m.tool_url.startsWith('https://')) {
    // Return path-only form for portability
    return m.tool_url.replace('https://apexlogics.org', '');
  }
  return `/tools/${m.tool_id}/`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // 1. Read existing graph file (must exist; scaffolded by prior session).
  if (!fs.existsSync(GRAPH_FILE)) {
    console.error(`ERROR: ${GRAPH_FILE} not found. Scaffold must exist.`);
    process.exit(1);
  }
  const graph = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8'));

  // 2. Discover all tool directories.
  const toolDirs = fs.readdirSync(TOOLS_DIR)
    .filter(d => fs.statSync(path.join(TOOLS_DIR, d)).isDirectory())
    .sort();

  // 3. Read manifests.
  const manifests = [];
  for (const dir of toolDirs) {
    const m = readManifest(dir);
    if (!m) { console.log(`  skip (no manifest): ${dir}`); continue; }
    if (RETIRED_AL_IDS.has(m.al_id)) {
      console.log(`  skip (retired): ${dir} → ${m.al_id}`);
      continue;
    }
    // Also skip if status is 'cut' or 'absorbed_into_...'
    if (m.status && (m.status.startsWith('absorbed') || m.status === 'cut')) {
      console.log(`  skip (${m.status}): ${dir}`);
      continue;
    }
    manifests.push(m);
  }
  console.log(`\nFound ${manifests.length} active tool manifests.`);

  // 4. Build a mandate_type → al_id lookup (first emitter wins; handles overlap).
  const mandateToAlId = {};
  for (const m of manifests) {
    if (Array.isArray(m.ap2_mandate_types)) {
      for (const mt of m.ap2_mandate_types) {
        if (!mandateToAlId[mt]) mandateToAlId[mt] = m.al_id;
      }
    }
  }

  // 5. Build consumes-by map from §6.3 seeds.
  const consumedByMap = buildConsumedByMap();

  // 6. Build nodes.
  const nodes = [];
  for (const m of manifests) {
    const alId = m.al_id;

    // --- feeds: from manifest + §6.3 seeds ---
    const feedsFromManifest = Array.isArray(m.downstream_handoff_candidates)
      ? m.downstream_handoff_candidates
      : [];
    const feedsFromSeed = FEEDS_SEED[alId] || [];
    const feeds = mergeUnique(feedsFromManifest, feedsFromSeed);

    // --- consumes: from manifest ap2_inbound_mandate_types (resolve to al_ids) + §6.3 seed ---
    const consumesFromInbound = Array.isArray(m.ap2_inbound_mandate_types)
      ? m.ap2_inbound_mandate_types
          .map(mt => mandateToAlId[mt])
          .filter(Boolean)
      : [];
    const consumesFromSeed = consumedByMap[alId] || [];
    const consumes = mergeUnique(consumesFromInbound, consumesFromSeed);

    // --- persona: use first persona value from manifest (raw; callers may normalize) ---
    const personaRaw = Array.isArray(m.personas) && m.personas.length > 0
      ? m.personas[0]
      : null;

    const node = {
      tool_id:      m.tool_id,
      al_id:        alId,
      display_name: m.title || m.name || m.tool_id,
      mcp_name:     getMcpName(m),
      mandate_type: getPrimaryMandateType(m),
      all_mandate_types: Array.isArray(m.ap2_mandate_types) ? m.ap2_mandate_types : [],
      category:     m.category || null,
      persona:      personaRaw,
      url:          getUrl(m),
      consumes,
      feeds,
      data_vintage: m.data_vintage || null,
      status:       m.status || 'unknown',
    };

    nodes.push(node);
  }

  // 7. Sort nodes by al_id (numeric order; handle compound "AL-06+16").
  nodes.sort((a, b) => {
    const numA = parseInt((a.al_id || '').replace(/AL-/, '').split('+')[0], 10) || 0;
    const numB = parseInt((b.al_id || '').replace(/AL-/, '').split('+')[0], 10) || 0;
    return numA - numB;
  });

  // 8. Validate: all al_ids unique? mcp_names unique?
  const alIdSet  = new Set();
  const mcpNames = new Set();
  let warnings   = 0;
  for (const n of nodes) {
    if (alIdSet.has(n.al_id)) {
      console.warn(`  WARN: duplicate al_id ${n.al_id} (${n.tool_id})`);
      warnings++;
    }
    alIdSet.add(n.al_id);

    if (n.mcp_name) {
      if (mcpNames.has(n.mcp_name)) {
        console.warn(`  WARN: duplicate mcp_name '${n.mcp_name}' at ${n.al_id}`);
        warnings++;
      }
      mcpNames.add(n.mcp_name);
    }
  }

  // 9. Update graph JSON.
  graph.version        = '1.0.0';
  graph.status         = 'generated';
  graph.generated_at   = new Date().toISOString().slice(0, 10);
  graph.generated_from = 'scripts/build_chaingraph.js';
  graph.node_count     = nodes.length;
  graph.nodes          = nodes;
  // Remove provisional sample (kept metadata note)
  delete graph.nodes_sample;

  // 10. Write.
  const out = JSON.stringify(graph, null, 2) + '\n';
  fs.writeFileSync(GRAPH_FILE, out, 'utf8');

  console.log(`\n✓ wrote ${nodes.length} nodes → chaingraph.json`);
  if (warnings > 0) {
    console.warn(`  ${warnings} warning(s) — review above before committing.`);
  }
  console.log(`  al_ids:   ${alIdSet.size}`);
  console.log(`  mcp_names: ${mcpNames.size} (${nodes.length - mcpNames.size} missing)`);
  console.log('\nRun gate: node scripts/check_tools.js');
}

main();
