# Apex Logics — Career & Education Finance Suite

> 28 deterministic, browser-based tools for career ROI, education finance, compensation analysis, licensing, and immigration.  
> Built by [Post Oak Labs](https://postoaklabs.com) · [Apex Advisory](https://apexadvisory.site) · Live at [apexlogics.org](https://apexlogics.org)

🔒 **Zero PII** · 📡 **Zero APIs** · 💻 **Client-Side Only** · 🌍 **6-Language i18n** · 📜 **CC BY 4.0**

---

## What This Is

A privacy-first, deterministic tool suite covering:

- Career ROI modeling & transition planning
- Education finance (FAFSA, student loans, graduate school)
- Compensation analysis (equity, total comp, offer negotiation)
- Test prep & certification investment analysis
- International student cost modeling
- Professional licensing & visa strategy
- Workforce program ROI & career resilience scoring
- AP2 mandate exports for AI-assisted advisory handoffs

## Repository Structure

```
apexlogics/
├── index.html          ← Homepage (28 tool cards)
├── tools/              ← 28 self-contained tool pages (one subdir each)
│   └── {slug}/
│       └── index.html
├── assets/             ← Brand assets (SVG logos)
├── scripts/            ← CI validation scripts
├── sitemap.html        ← Human-readable sitemap
├── sitemap.xml         ← Machine-readable sitemap
├── suite-registry.json ← Machine-readable tool index
├── llms.txt            ← Agent-readable suite index
└── .github/workflows/  ← Deploy pipeline (preflight → rsync → smoke test)
```

## Architecture

- **Single-file tools:** Each lives in `tools/{slug}/index.html` with fully inline CSS/JS. No build step, no dependencies, no CDN calls after page load.
- **Deterministic execution:** Rule-based math, schema validation, static reference tables. Reproducible outputs.
- **AP2-compliant exports:** Machine-readable policy mandates + Markdown audit trails, validated before download.
- **i18n:** Full UI chrome translation across `EN · ES · FR · AR · PT · 中文`.

## Technical Specifications

| Item | Detail |
|------|--------|
| Build contract | `CLAUDE.md` (architecture rules) |
| Storage | `sessionStorage` for `apex_lang` + `apex_intro_dismissed` only. No `localStorage`, cookies, or IndexedDB. |
| Network | Zero `fetch`, CDN, WebWorker, or external API calls after page load |
| PII banner | All tools display: *"🔒 All inputs are processed locally in your browser. Nothing is transmitted, stored, or logged. Inputs disappear when you close the tab."* |
| Export format | AP2 v1.0 mandate JSON + Markdown |
| License | CC BY 4.0 |

## Deploy Pipeline

Every push to `main` runs:

1. **Pre-flight** — index sync check (every tool subdir has a homepage card), CRLF guard
2. **Deploy** — rsync to DreamHost via SSH (excludes `.git/`, `scripts/`, `*.md`, etc.)
3. **Smoke test** — HTTP 200 check against live domain

Required GitHub Secrets: `DH_SSH_KEY`, `DH_SSH_USER`, `DH_SSH_HOST`, `DH_WEB_ROOT`, `DH_SITE_URL`

## Adding a Tool

1. Create `tools/{kebab-slug}/index.html` (single self-contained file per architecture rules)
2. Add a card to `index.html` with `href="tools/{kebab-slug}/index.html"`
3. Push — CI validates and deploys automatically

## Links

- [Live Suite](https://apexlogics.org)
- [Post Oak Labs](https://postoaklabs.com)
- [Apex Advisory](https://apexadvisory.site)
- [Sister suite: AINumbers.co](https://ainumbers.co)

---

© Post Oak Labs · CC BY 4.0 · 2026
