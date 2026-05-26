# CLAUDE.md — Apex Logics Project

**Last updated:** 2026-05-26 | **Suite status: COMPLETE — 28/28 tools shipped**

---

## What This Project Is

**Apex Logics** (`apexlogics.org`) is a browser-based edtech/careertech tool suite of 28 self-contained HTML calculators covering career ROI, education finance, compensation analysis, licensing, and immigration. Built by **Tim** (Post Oak Labs / Apex Advisors). Each tool is a single `.html` file — no build step, no dependencies, no external API calls. All computation is deterministic, client-side, and GDPR-friendly.

**Sister suite:** AINumbers.co (fintech, separate repo/contract).  
**Consulting front-end:** ApexAdvisory.site (MBA/career/TOEFL clients route into Apex Logics tools).  
**Tim's context:** Founder/operator. Technical. No hand-holding needed. Prefers dense responses.

---

## Current State (as of 2026-05-26)

| Field | Value |
|---|---|
| Tools shipped | **28 / 28** (complete) |
| Master Spec | v9.7 |
| CONTRACT | v1.2 (Appendix F validMandateTypes updated to 25 types) |
| Registry | v3.1.0 |
| Display numbers | #01–#28, all live |
| Build queue | Empty — no deferred, no proposed |
| Deployment | Local repo; `apexlogics.org` deployment pending |

**Full-suite CONTRACT compliance audit completed 2026-05-26 — all issues resolved:**
- ✅ PII banner fixed in all 28 tools (was wrong in 13; now exact CONTRACT §1.3 text everywhere)
- ✅ validMandateTypes expanded to 25 types in all tools + CONTRACT Appendix F (7 types were missing for AL-29–33 batch)
- ✅ Export button order correct in all tools (Markdown FIRST, AP2 SECOND)
- ✅ AP2Schema.validate() called before URL.createObjectURL() in all tools
- ✅ audit_metadata block present in all mandate builders
- ✅ AK/HI poverty guidelines are implemented in AL-17 (confirmed in code; prior note was incorrect)

**Remaining known issues:**
- AL-07 (`workforce-board-roi-report/index.html`) has 8 null bytes — treat as binary when reading/writing

---

## Tool Registry — All 28 (sorted by display number)

| # | AL-ID | Title | Slug |
|---|---|---|---|
| #01 | AL-02 | Credential ROI Suite | `credential-roi-suite` |
| #02 | AL-17 | FAFSA SAI Simulator | `fafsa-sai-simulator` |
| #03 | AL-26 | Graduate School ROI Comparator | `graduate-school-roi-comparator` |
| #04 | AL-23 | Benefits Open Enrollment Optimizer | `benefits-open-enrollment-optimizer` |
| #05 | AL-25 | Offer Negotiation Suite | `offer-negotiation-suite` |
| #06 | AL-06+16 | Career Resilience Engine | `career-resilience-engine` |
| #07 | AL-08+14 | Career Transition Suite | `career-transition-suite` |
| #08 | AL-24 | Separation Package Analyzer | `severance-decision-engine` |
| #09 | AL-27 | Job Search ROI Tracker | `job-search-roi-tracker` |
| #10 | AL-28 | Career Break & Reentry Cost Engine | `career-break-reentry-engine` |
| #11 | AL-03 | Human Capital Engine | `human-capital-engine` |
| #12 | AL-18 | CPD / CPE Credit Tracker | `cpd-credit-tracker` |
| #13 | AL-20 | Exam Cost & Timeline Planner | `exam-cost-planner` |
| #14 | AL-12 | Scholarship ROI Tracker | `scholarship-roi-tracker` |
| #15 | AL-07 | Workforce Board ROI Report Generator | `workforce-board-roi-report` |
| #16 | AL-11 | Apprenticeship & Earn-and-Learn Matcher | `apprenticeship-matcher` |
| #17 | AL-29 | MBA Program Fit & ROI Ranker | `mba-program-fit-ranker` |
| #18 | AL-30 | Test Prep Investment Analyzer | `test-prep-investment-analyzer` |
| #19 | AL-31 | International Student Cost Modeler | `international-student-cost-modeler` |
| #20 | AL-32 | Parent College ROI Planner | `parent-college-roi-planner` |
| #21 | AL-33 | Equity Compensation Analyzer | `equity-compensation-analyzer` |
| #22 | AL-13 | Student Loan Repayment Optimizer | `student-loan-repayment-optimizer` |
| #23 | AL-22 | Freelance / 1099 Total Cost Calculator | `freelance-1099-total-cost-calculator` |
| #24 | AL-05 | Education Savings Projector | `education-savings-projector` |
| #25 | AL-01 | Total Compensation Suite | `total-compensation-suite` |
| #26 | AL-04 | Geo-Fiscal Arbitrage Simulator | `geo-fiscal-arbitrage-simulator` |
| #27 | AL-09 | Visa Strategy Navigator | `visa-strategy-navigator` |
| #28 | AL-10 | Professional License Reciprocity Checker | `professional-license-reciprocity` |

---

## Key Files — What to Read and When

| File | Purpose | Size | When to read |
|---|---|---|---|
| `apexlogics_CONTRACT.md` | **SSOT build rules** — hard constraints, UI contract, AP2 schema, export tiers, hub architecture, cross-suite integration | 52KB / 977 lines | Before any tool build or audit. Use section index at top. |
| `ApexLogics_v8_MasterSpec.md` | Tool catalog — what tools exist, display numbering, category distribution, AP2 handoff map | 33KB / 430 lines | For registry context. Use section index at top. |
| `suite-registry.json` | Machine-readable tool index (v3.1.0) | 40KB / 1197 lines | Grep for specific tool; do NOT read whole. |
| `ApexLogics_Audit_Rubric_v1.md` | 76-check QA rubric for tool builds | 23KB | Read whole when auditing a new tool build. |
| `llms.txt` | Agent-readable suite index (334 lines, all 28 tools, full AP2 handoff map) | 17KB | Reference for agent integration work. |
| `HANDOFF_PROMPT_NEXT_SESSION.md` | Last session recap (2026-05-21) — what was built, post-build update log | 4KB | Quick orientation for a new session. |
| `ARCHIVE/ApexLogics_AL-NN_Audit_Scorecard.md` | Per-tool QA records (16 files in ARCHIVE/, all SHIPPED ✅) | 8–18KB each | Only when revisiting a specific tool's audit. |
| `.well-known/mcp.json` | MCP server endpoint definition | 3KB | MCP integration work only. |
| `assets/logo.svg`, `assets/logo-favicon.svg` | Brand assets | <1KB | Visual/deployment work. |

**Derivative / historical files (lower priority):**
| File | Status |
|---|---|
| `ApexLogics_BuiltTools_Merged.md` | Covers only 9 of 28 tools; stale backlog (all items now shipped). Historical artifact. |
| `ApexLogics_v8_Spec_Consistency_Findings.md` | All 11 findings resolved in v8.1. Fully superseded. |
| `ApexLogics_v4plus_Simplified_Spec.md` | All 4 v4+ tools now shipped. Superseded by MasterSpec v9.7. |

---

## ⚠️ Do NOT Read These Whole — Token Landmines

These files are large and self-contained. Read only targeted sections using `grep`, `head`, or line-offset reads.

| File | Size | Why dangerous | How to target |
|---|---|---|---|
| `tools/*/index.html` | 52–90KB each (28 files = ~2MB total) | Single-file tool implementations; mostly JS logic and embedded data | Grep for specific function/section; read first/last 50 lines for structure |
| `index.html` | 84KB | Hub page with 28 tool cards inline | Grep for specific card or section |
| `sitemap.html` | 34KB | Rendered sitemap; derivative of registry | Rarely needed; grep only |
| `suite-registry.json` | 40KB / 1197 lines | Full JSON for all 28 tools | Use `python3 -c "import json; ..."` or grep for specific al_id |
| `assets/logo_candidates.html` | 24KB | Logo design explorations; historical | Only for brand/design work |
| `ApexLogics_Audit_Rubric_v1.md` | 23KB / 300 lines | Dense 76-check rubric | Read whole only when running a new audit |

---

## Architecture Rules (from CONTRACT — do not deviate)

- **Single `.html` per tool.** All CSS/JS inline. Google Fonts only (`DM Serif Display`, `Sora`, `JetBrains Mono`).
- **Zero `fetch`, `async`, `WebWorker`, external network calls** after page load. Pure synchronous, deterministic.
- **Zero PII.** No `localStorage`, `cookies`, `IndexedDB`. `sessionStorage` only for `apex_lang` + `apex_intro_dismissed`.
- **PII banner exact text:** `"🔒 All inputs are processed locally in your browser. Nothing is transmitted, stored, or logged. Inputs disappear when you close the tab."`
- **Export row order:** Markdown FIRST, AP2 SECOND in `.results-export-row`.
- **Internal links:** relative paths only (`../tools/...`).
- **Relative path from tool to hub:** `../../index.html`
- **AP2 validate before download:** `AP2Schema.validate()` called before `URL.createObjectURL()` in export functions.
- **AP2Schema.validMandateTypes:** 25 types total (18 original + 7 added 2026-05-26 for AL-29–33 batch). Must stay in sync across all tools and CONTRACT Appendix F.

---

## AP2 Handoff Protocol

Tools emit JSON mandates via `?ap2=encodeURIComponent(JSON.stringify(mandate))`. Receiving tools parse, validate, dispatch, and show import badge. All 25 mandate types are live. Multi-tab tools include a `tab` field in the payload to distinguish context. See CONTRACT §6 for the full map and §6.4 for inbound dispatch pattern.

---

## Working Style (Tim's preferences)

- Dense, direct responses. No fluff or recap summaries.
- Use `AskUserQuestion` popups for non-trivial pre-build clarifications (not inline numbered lists).
- Per-tool audit scorecards are part of the deliverable, not a follow-up.
- Surface contract gaps explicitly during builds — don't silently work around them.
- Provide `computer://` file links for all deliverables.
- **Shell environment:** PowerShell on Windows. Use PowerShell syntax for any shell commands (not bash/zsh). Path separator is `\`. The Cowork sandbox runs Linux internally — Bash tool uses Linux paths, but file tool paths use Windows (`C:\dev\...`).

---

## Possible Future Work

- Deploy to `apexlogics.org` (static hosting)
- Data vintage refresh (BLS OEWS 2024 when available)
- Public GitHub repo for CC BY 4.0 attribution
- Write audit scorecards for AL-29–AL-33 (AL-29, AL-30, AL-31, AL-32, AL-33 — built in 2026-05-21 batch, no scorecards yet)
