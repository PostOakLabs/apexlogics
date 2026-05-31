# CLAUDE.md — Apex Logics Repo

**Last updated:** 2026-05-30 | **Suite status: COMPLETE — 35 tools shipped**

> **Full context lives in the parent folder.** Read `../CLAUDE.md` first — it has the tool registry, architecture rules, token landmines, known gotchas, and working style. This file covers repo-specific concerns only.

---

## Repo State

| Field | Value |
|---|---|
| Tools shipped | **35** (AL-01–AL-40; AL-06+16 and AL-08+14 combined) |
| Display numbers | #01–#35 |
| CONTRACT | v1.4.0 (internal: `../apexlogics_CONTRACT.md`) |
| MasterSpec | v9.9 (internal: `../ApexLogics_v8_MasterSpec.md`) |
| Suite registry | v3.2.1 — `suite-registry.json` |
| Demos | 12 live at `/demos/` |
| Sitemap URLs | 51 (`sitemap.xml`) |
| GitHub | `github.com/PostOakLabs/apexlogics` (public, CC BY 4.0) |

---

## What's Public Here vs. Internal-Only

**This repo (public):** `suite-registry.json`, `llms.txt`, `index.html`, `demos/`, `tools/*/`, `.well-known/mcp.json`, `assets/`, `scripts/`, `sitemap.xml`, `robots.txt`, `contact.html`

**Internal only (parent folder, NOT pushed):** `apexlogics_CONTRACT.md`, `ApexLogics_v8_MasterSpec.md`, `HANDOFF_PROMPT_NEXT_SESSION.md`, `ARCHIVE/`

Do not commit parent-folder internal files to this repo.

---

## Deploy (GitHub → DreamHost)

Push to `main` triggers GitHub Actions rsync to DreamHost. Full deploy details in memory (`project_apexlogics_deploy`). Key facts:

- **DreamHost user:** `apexlogics` | **Host:** `pdx1-shared-a1-41.dreamhost.com`
- **Web root:** `/home/apexlogics/apexlogics.org`
- **SSH key:** `C:\Users\Disco\.ssh\apexlogics_deploy`
- **Pre-flight:** `scripts/check_index_sync.py` — verifies all 35 tool subdirs have hub cards

Standard push:
```powershell
cd "C:\dev\Claude\Projects\Apex Logics\repo"
git add -A
git commit -m "description"
git push
```

---

## Repo Structure

```
repo/
├── index.html              # Hub (35 tool cards) — 84KB, grep don't read whole
├── suite-registry.json     # MCP registry v3.2.1 — 40KB, grep don't read whole
├── llms.txt                # Agent index — 35 tools
├── sitemap.xml             # 51 URLs
├── demos/                  # 12 multitool demos
├── tools/<slug>/
│   ├── index.html          # Tool implementation (52–90KB each)
│   └── manifest.json       # al_id, sister_suite, consulting_site
├── .well-known/mcp.json    # MCP discovery shim
├── assets/                 # logo.svg, logo-favicon.svg
└── scripts/
    └── check_index_sync.py # Pre-flight sync checker
```
