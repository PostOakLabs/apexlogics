# Apex Logics - Deterministic Decision Engines for People, Creators, and Agents

[![License: CC BY 4.0](https://img.shields.io/badge/license-CC%20BY%204.0-lightgrey.svg)](LICENSE)
[![Live site](https://img.shields.io/badge/live-apexlogics.org-2ea44f)](https://apexlogics.org)
[![MCP endpoint](https://img.shields.io/badge/MCP-mcp.apexlogics.org-blueviolet)](https://mcp.apexlogics.org)

> Deterministic, rule-based, browser-only engines for career ROI, education finance, compensation analysis, licensing, immigration, and workforce development. Sister suite: [AINumbers.co](https://ainumbers.co) (markets & institutions).  
> Built by [Post Oak Labs](https://postoaklabs.com) · [Apex Advisory](https://apexadvisory.site) · Live at [apexlogics.org](https://apexlogics.org)

🔒 **Zero PII** · 📡 **Zero APIs** · 💻 **Client-Side Only** · 📜 **CC BY 4.0**

---

## What This Is

A privacy-first, deterministic tool suite covering:

- Career ROI modeling & transition planning
- Education finance (FAFSA, student loans, graduate school, OBBBA)
- Compensation analysis (equity, total comp, offer negotiation, raise strategy)
- Test prep & certification investment analysis
- International student cost modeling & immigration strategy
- Professional licensing & visa pathways
- Workforce program ROI & career resilience
- Trade & veteran career transitions
- Childcare economics & parental leave
- AP2 mandate exports for AI-assisted advisory handoffs

**Current tool count, workflows, and guides:** see [`llms.txt`](llms.txt) or [`suite-registry.json`](suite-registry.json).

---

## Repository Structure

```
apexlogics/
├── index.html              ← Homepage (tool cards + workflow links)
├── tools/                  ← Self-contained tool pages (one subdir each)
│   └── {slug}/
│       ├── index.html      ← Single-file tool (inline CSS/JS)
│       └── manifest.json   ← MCP tool definition + AP2 schema
├── workflows/              ← Multi-tool decision journeys
├── guides/                 ← Topic hubs (student loans, selected studies, etc.)
├── assets/                 ← Brand assets (SVG logos)
├── scripts/                ← CI validation scripts
├── sitemap.html            ← Human-readable sitemap
├── sitemap.xml             ← Machine-readable sitemap
├── suite-registry.json     ← Machine-readable tool index (authoritative counts)
├── llms.txt                ← Agent-readable suite index
├── .well-known/mcp.json    ← MCP discovery endpoint
└── .github/workflows/      ← Deploy pipeline (preflight → rsync → smoke test)
```

---

## MCP Agent Access

Every tool is also exposed to AI agents via a live MCP server:

```
https://mcp.apexlogics.org
```

```json
{
  "mcpServers": {
    "apexlogics": { "url": "https://mcp.apexlogics.org" }
  }
}
```

Server source: [`apexlogics-mcp-worker`](https://github.com/PostOakLabs/apexlogics-mcp-worker) (Cloudflare Worker, deterministic calculator kernels). Use `find_tool` to search the live index rather than hardcoding tool names - counts drift as the suite grows.

---

## Architecture

- **Single-file tools:** Each lives in `tools/{slug}/index.html` with fully inline CSS/JS. No build step, no dependencies, no CDN calls after page load.
- **Deterministic execution:** Rule-based math, schema validation, static reference tables. Reproducible outputs.
- **AP2-compliant exports:** Machine-readable policy mandates (v2.0 flat schema) + Markdown audit trails, validated before download.
- **English-only UI.** No i18n toggle.

---

## Technical Specifications

| Item | Detail |
|------|--------|
| Build contract | `CLAUDE.md` in parent folder (internal) |
| Storage | Minimal `sessionStorage` only - no `localStorage`, cookies, or IndexedDB |
| Network | Zero `fetch`, CDN, WebWorker, or external API calls after page load |
| PII banner | All tools display: *"🔒 All inputs are processed locally in your browser. Nothing is transmitted, stored, or logged. Inputs disappear when you close the tab."* |
| Export format | AP2 v2.0 mandate JSON + Markdown (Tier 1 mandatory); CSV/PDF/SVG optional by tool type |
| License | CC BY 4.0 |

---

## Deploy Pipeline

Every push to `main` runs:

1. **Pre-flight** - index sync check (every tool subdir has a hub card), JS syntax gate, CRLF guard
2. **Deploy** - rsync to DreamHost via SSH (excludes `.git/`, `scripts/`, `*.md`, etc.)
3. **Smoke test** - HTTP 200 check against live domain

Required GitHub Secrets: `DH_SSH_KEY`, `DH_SSH_USER`, `DH_SSH_HOST`, `DH_WEB_ROOT`, `DH_SITE_URL`

---

## Adding a Tool

1. Create `tools/{kebab-slug}/index.html` (single self-contained file per architecture rules)
2. Create `tools/{kebab-slug}/manifest.json` with required fields (`al_id`, `sister_suite`, `consulting_site`)
3. Add a card to `index.html`
4. Update `suite-registry.json`, `llms.txt`, `sitemap.xml`, `sitemap.html`
5. Run `node scripts/check_tools.js` - must exit 0
6. Push - CI validates and deploys automatically

---

## Links

- [Live Suite](https://apexlogics.org)
- [Post Oak Labs](https://postoaklabs.com)
- [Apex Advisory](https://apexadvisory.site)
- [Sister suite: AINumbers.co](https://ainumbers.co)

---

© Post Oak Labs · CC BY 4.0 · 2026
