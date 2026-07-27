# QA Scorecard — AL-150 Federal / Public Buyout Decision Engine

**Tool:** AL-150 · #143 · `143-federal-buyout-decision`  
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
| 13 | Footer: `About · CC BY 4.0 · AL-150 · Data: FERS/OPM 2026` | ✅ PASS |
| 14 | Footer: no partner links | ✅ PASS |
| 15 | Logo amber #E8A838 on "Apex" wordmark | ✅ PASS |
| 16 | Internal links relative (../../index.html) | ✅ PASS |
| 17 | manifest.json: al_id, sister_suite, consulting_site present | ✅ PASS |
| 18 | Policy Mandate type: `buyout_decision_record` | ✅ PASS |
| 19 | Policy Mandate v2.0 flat schema (ap2_version:"2.0", all required fields) | ✅ PASS |
| 20 | Category: `workforce_exit` | ✅ PASS |

## Calculation Verification

| # | Check | Result |
|---|---|---|
| 21 | FERS formula: 1.0% × high-3 × years; 1.1% if age 62+ and 20+ yr | ✅ PASS |
| 22 | Net buyout = severancePay × (1 − taxRate) | ✅ PASS |
| 23 | Health bridge = continuedHealthMonths × monthlyHealthCost | ✅ PASS |
| 24 | 5-yr income comparison: base private offer × 5 vs current × stayYears | ✅ PASS |
| 25 | VSIP cap: $25,000 per 5 USC §3523(b)(3)(B) — warn if severance >$25K labeled VSIP | ✅ PASS |

---

**Spot check:** $80,000 salary, 20 years, age 58, FERS, $25,000 VSIP, 6 months FEHB ($1,200/mo), 24% tax rate.  
- Net VSIP: $25,000 × 0.76 = $19,000 ✅  
- Health bridge: 6 × $1,200 = $7,200 ✅  
- FERS annuity (deferred at 62): 1.0% × $80,000 × 20 = $16,000/yr ✅ (1.1% not triggered — age 58, not 62+)
