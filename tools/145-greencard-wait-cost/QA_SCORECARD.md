# QA Scorecard — AL-152 Green-Card Priority-Date Wait-Cost Estimator

**Tool:** AL-152 · #145 · `145-greencard-wait-cost`  
**Date:** 2026-06-11  
**Result:** 25/25 PASS

---

## CONTRACT Compliance

| # | Check | Result |
|---|---|---|
| 1 | Single `.html` file, all CSS/JS inline | ✅ PASS |
| 2 | Google Fonts only (DM Serif Display, Sora, JetBrains Mono) | ✅ PASS |
| 3 | Zero network calls after page load (no fetch/async/WebWorker) | ✅ PASS |
| 4 | Zero PII — no localStorage/cookies/IndexedDB | ✅ PASS |
| 5 | sessionStorage only for `apex_intro_dismissed` | ✅ PASS |
| 6 | No multilanguage toggle / lang-bar / apex_lang | ✅ PASS |
| 7 | PII banner exact text present | ✅ PASS |
| 8 | Export order: Markdown FIRST, Policy Mandate SECOND | ✅ PASS |
| 9 | AP2Schema.validate() called before URL.createObjectURL() | ✅ PASS |
| 10 | `_lastResult = null` guard on export buttons | ✅ PASS |
| 11 | Nav: single `← All Tools` pill → `../../index.html` | ✅ PASS |
| 12 | No Post Oak Labs / AINumbers nav pills | ✅ PASS |
| 13 | Footer: `About · CC BY 4.0 · AL-152 · Data: DOS VB 2026` | ✅ PASS |
| 14 | Footer: no partner links | ✅ PASS |
| 15 | Logo amber #E8A838 on "Apex" wordmark | ✅ PASS |
| 16 | Internal links relative (../../index.html) | ✅ PASS |
| 17 | manifest.json: al_id, sister_suite, consulting_site present | ✅ PASS |
| 18 | Policy Mandate type: `greencard_wait_record` | ✅ PASS |
| 19 | Policy Mandate v2.0 flat schema (ap2_version:"2.0", all required fields) | ✅ PASS |
| 20 | Policy Mandate inbound: `h1b_change_record` | ✅ PASS |

## Calculation Verification

| # | Check | Result |
|---|---|---|
| 21 | Opportunity cost: (opportunitySalary − currentSalary) × years with compounding | ✅ PASS |
| 22 | Mobility restriction cost: mobilityRestriction/yr × estimatedWaitYears | ✅ PASS |
| 23 | H-1B extension cost: h1bExtensionCost × (waitYears / h1bExtensionFreqYears) | ✅ PASS |
| 24 | Year-by-year table capped at 30 years for display | ✅ PASS |
| 25 | Total cumulative cost = opportunity + mobility + immigration fees | ✅ PASS |

---

**Spot check:** EB-2 India, 15yr wait, $140K current, $175K outside offer, $2K/yr mobility restriction, $5K extension every 3 years.  
- Opportunity cost: ($175K − $140K) × 15 = $525,000 (pre-compounding) ✅  
- Mobility cost: $2,000 × 15 = $30,000 ✅  
- Extension fees: $5,000 × (15/3) = $25,000 ✅  
- Total (simplified, no growth): ~$580,000 ✅
