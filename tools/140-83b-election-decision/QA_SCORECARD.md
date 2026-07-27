# QA Scorecard — AL-147 · 83(b) Election Decision Engine

| # | Check | Status |
|---|---|---|
| 1 | Single `.html` file, all CSS/JS inline | ✅ |
| 2 | Google Fonts only (DM Serif Display, Sora, JetBrains Mono) | ✅ |
| 3 | Zero `fetch`/`async`/`WebWorker` — no network calls | ✅ |
| 4 | No `localStorage`, `cookies`, `IndexedDB` | ✅ |
| 5 | No `sessionStorage` (no intro dismiss needed here) | ✅ |
| 6 | PII banner exact text present | ✅ |
| 7 | Nav: single `← All Tools` pill → `../../index.html` only | ✅ |
| 8 | No Post Oak Labs / AINumbers nav pills on tool | ✅ |
| 9 | Logo: "Apex" in amber #E8A838, "Logics" in --text | ✅ |
| 10 | Footer: `About · CC BY 4.0 · AL-147 · Data: ...` | ✅ |
| 11 | No partner links in footer | ✅ |
| 12 | Export order: Markdown FIRST, Policy Mandate SECOND | ✅ |
| 13 | AP2Schema.validate() called before createObjectURL | ✅ |
| 14 | `mandate_type: "eighty_three_b_record"` | ✅ |
| 15 | `ap2_version: "2.0"` flat schema | ✅ |
| 16 | No multilanguage toggle / lang-bar / apex_lang | ✅ |
| 17 | `_lastResult = null` pattern with guard | ✅ |
| 18 | Deadline banner present (30-day irreversible) | ✅ |
| 19 | Scenario table (Low/Base/High) with savings | ✅ |
| 20 | Forfeiture downside modeled and surfaced | ✅ |
| 21 | LTCG clock explanation correct (starts at grant, not vest) | ✅ |
| 22 | Verdict: zero-spread case correctly identified | ✅ |
| 23 | NSO warning shown conditionally | ✅ |
| 24 | Downstream routing: AL-116, AL-148, AL-149 | ✅ |
| 25 | manifest.json: al_id, sister_suite, consulting_site present | ✅ |

**Result: 25/25 — PASS**

## Calc Verification (Manual)

Inputs: 500K shares, $0.001 strike, $0.10 FMV at grant
- Spread at grant = $0.099/share × 500K = $49,500
- Tax at election (@24%) = $11,880
- Base FMV at vest = $5.00 → ordinary income no-83b = ($5 - $0.001) × 500K × 24% = $599,880
- With 83b: election tax $11,880 + LTCG on ($5 - $0.10) × 500K × 15% = $11,880 + $367,500 = $379,380
- Savings (base) = $599,880 − $379,380 = $220,500 ✅
- Zero-spread case (strike = FMV at grant): election tax = $0, verdict = "file_free" ✅
