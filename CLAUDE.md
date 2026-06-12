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

**This repo (public):** `suite-registry.json`, `llms.txt`, `index.html`, `tools/*/`, `workflows/*/`, `guides/*/`, `.well-known/mcp.json`, `assets/`, `scripts/`, `sitemap.xml`, `sitemap.html`, `robots.txt`, `contact.html`, `about.html`

**Internal only (parent folder, NOT pushed):** `apexlogics_CONTRACT.md`, `ApexLogics_v8_MasterSpec.md`, `ARCHIVE/`, build spec files

Do not commit parent-folder internal files to this repo.

---

## Deploy (GitHub → DreamHost)

Push to `main` triggers GitHub Actions rsync to DreamHost. Full deploy details in memory (`project_apexlogics_deploy`). Key facts:

- **DreamHost user:** `apexlogics` | **Host:** `pdx1-shared-a1-41.dreamhost.com`
- **Web root:** `/home/apexlogics/apexlogics.org`
- **SSH key:** `C:\Users\Disco\.ssh\apexlogics_deploy`
- **Pre-flight:** `scripts/check_index_sync.py` — verifies tool subdirs match hub cards; `node scripts/check_tools.js` JS syntax gate (must exit 0)

Standard push:
```powershell
cd "C:\dev\Claude\Projects\Apex Logics\repo"
node scripts/check_tools.js   # must print 0 — blocking gate
git add -A
git commit -m "description"
git push
```

---

## Repo Structure

```
repo/
├── index.html              # Hub (tool cards + workflow section) — grep don't read whole
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
    ├── check_index_sync.py # Pre-flight hub↔dirs sync checker
    └── check_tools.js      # JS syntax gate (CG-25 — blocking before any tool HTML commit)
```

---

## Ship Cycle Checklist (CG-23 parity rule)

Before every commit touching tool files, verify count parity across all five surfaces:
1. Hub cards in `index.html`
2. Tool entries in `suite-registry.json`
3. `### #` lines in `llms.txt`
4. `<url>` entries in `sitemap.xml`
5. Tool links in `sitemap.html`

All five must agree. `node scripts/check_tools.js` must print `0`.
