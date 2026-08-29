# CLAUDE.md — Apex Logics Repo

**Last updated:** 2026-06-12 | **Authoritative counts: `suite-registry.json` header — trust it over this file when they disagree.**

> **Full context lives in the parent folder.** Read `../CLAUDE.md` first — it has architecture rules, token landmines, known gotchas, and working style. This file covers repo-specific concerns only.

---

## Repo State

| Field | Value |
|---|---|
| Tools shipped | See `suite-registry.json` → `tools_count_shipped` |
| CONTRACT | v1.8.0 (internal: `../apexlogics_CONTRACT.md`) |
| Suite registry | v5.3.0 — `suite-registry.json` |
| Workflows | `/workflows/` (see `llms.txt` for count) |
| Guides | `/guides/` (see `llms.txt` for count) |
| Sitemap URLs | See `sitemap.xml` `<urlset>` count |
| GitHub | `github.com/PostOakLabs/apexlogics` (public, CC BY 4.0) |

---

## What's Public Here vs. Internal-Only

**This repo (public):** `suite-registry.json`, `llms.txt`, `index.html`, `tools.html`, `tools/*/`, `workflows/*/`, `guides/*/`, `.well-known/mcp.json`, `assets/`, `scripts/`, `sitemap.xml`, `sitemap.html`, `robots.txt`, `contact.html`, `about.html`

**Internal only (parent folder, NOT pushed):** `apexlogics_CONTRACT.md`, `ApexLogics_v8_MasterSpec.md`, `ARCHIVE/`, build spec files

Do not commit parent-folder internal files to this repo.

---

## Deploy (CI-owned — GitHub → DreamHost/CF)

**Deploy is automated. Tim never runs `wrangler` or merges PRs manually.** Flow: branch → PR → guardrails CI auto-merge → GitHub Actions rsync to DreamHost (+ CF worker auto-deploy). Full deploy details in memory (`apex-deploy-flow`, `project_apexlogics_deploy`). Key facts:

- **DreamHost user:** `apexlogics` | **Host:** `pdx1-shared-a1-41.dreamhost.com`
- **Web root:** `/home/apexlogics/apexlogics.org`
- **SSH key:** `C:\Users\Disco\.ssh\apexlogics_deploy`
- **Pre-flight (blocking gate):** `node scripts/check_tools.js` must exit 0; `node scripts/verify-counts.mjs` must exit 0 (count-drift gate, CG-32 — `--fix` to self-heal); `node scripts/check-no-storage.mjs` must exit 0 (zero-PII/zero-client-storage gate, CG-35 — no baseline, no exception list); `scripts/check_index_sync.py` verifies tool subdirs match `tools.html` cards (not `index.html` — that's the curated landing page).
- **Worker:** `apexlogics-mcp-worker/` has its own CI `deploy.yml` (gates + `generate.mjs` + wrangler dry-run, then auto-deploy). `generate.mjs` fetches the **live** `apexlogics.org/suite-registry.json` — so land the registry change first, then the worker push; CI regenerates `tools.json` and rebuilds the `find_tool` BM25 index. Do **not** run `npx wrangler deploy` by hand.

Claude runs git natively — commit + push directly after the gate passes (no paste-block for Tim). Prefer a branch+PR over direct push to `main` so CI carries it:
```bash
node scripts/check_tools.js   # must print 0 — blocking gate
git checkout -b <branch>
git add <specific files>
git commit -m "description"
git push -u origin <branch>    # then open PR; CI auto-merges + deploys
```

---

## Repo Structure

```
repo/
├── index.html              # Curated landing page (hero, topic tiles, 8 featured cards) — NOT the catalog (AL-HOMESPLIT)
├── tools.html              # Full tool catalog — all 168 cards, filter/search/persona UI. "Hub cards" for CG-23 means this file now.
├── suite-registry.json     # MCP registry — authoritative tool/count source; grep don't read whole
├── llms.txt                # Agent index — tools, workflows, guides, mandate types
├── sitemap.xml             # All URLs
├── sitemap.html            # Human-readable sitemap
├── tools/<slug>/
│   ├── index.html          # Tool implementation (52–90KB each)
│   ├── manifest.json       # al_id, sister_suite, consulting_site + MCP definition
│   └── QA_SCORECARD.md     # Per-tool audit record (excluded from rsync, present on GitHub)
├── workflows/              # Multi-tool decision journey pages
├── guides/                 # Topic hub pages (student loans, selected studies, etc.)
├── .well-known/mcp.json    # MCP discovery shim (137+ mandate types)
├── assets/                 # logo.svg, logo-favicon.svg
└── scripts/
    ├── check_index_sync.py # Pre-flight catalog↔dirs sync checker (targets tools.html, CG-32)
    ├── check_tools.js      # JS syntax gate (CG-25 — blocking before any tool HTML commit)
    ├── counts.mjs          # Single source of truth for suite/showcase/workflow/guide counts
    ├── verify-counts.mjs   # Count-drift gate (CG-32 — blocking; --fix to self-heal)
    └── check-no-storage.mjs # Zero-PII/zero-client-storage gate (CG-35 — blocking, zero exceptions)
```

---

## Ship Cycle Checklist (CG-23 parity rule)

Before every commit touching tool files, verify count parity across all five surfaces:
1. Hub cards in `tools.html` (not `index.html` — that's the curated landing page, CG-32)
2. Tool entries in `suite-registry.json`
3. `### #` lines in `llms.txt`
4. `<url>` entries in `sitemap.xml`
5. Tool links in `sitemap.html`

All five must agree. `node scripts/check_tools.js` must print `0`.
