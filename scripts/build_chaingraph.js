#!/usr/bin/env node
// ⛔ DO NOT RUN (Tim T-1, 2026-10-01; AL-CHAIN-FIDELITY). This generator rebuilds
// chains from the stale sub-journey lists and would WIPE the August hand repairs
// and the 2026-10 workflow-fidelity repair (memorial §2.3). chaingraph.json is
// hand-maintained; this script is retained for reference only.
// build_chaingraph.js — generate chaingraph.json nodes[]
// from 145 tool manifests + CONTRACT §6.3 handoff map.
// Run: cd repo && node scripts/build_chaingraph.js
// Sandbox: read-only (git show); real writes happen via this script on Windows.
