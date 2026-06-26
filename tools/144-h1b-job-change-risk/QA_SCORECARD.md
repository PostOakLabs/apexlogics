# QA Scorecard — AL-151 H-1B Job-Change Risk & Cost Calculator

**Tool:** AL-151 · #144 · `144-h1b-job-change-risk`  
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
| 12 | No ApexAdvisory / AINumbers nav pills | ✅ PASS |
| 13 | Footer: `About · CC BY 4.0 · AL-151 · Data: INA/USCIS 2026` | ✅ PASS |
| 14 | Footer: no partner links | ✅ PASS |
| 15 | Logo amber #E8A838 on "Apex" wordmark | ✅ PASS |
| 16 | Internal links relative (../../index.html) | ✅ PASS |
| 17 | manifest.json: al_id, sister_suite, consulting_site present | ✅ PASS |
| 18 | Policy Mandate type: `h1b_change_record` | ✅ PASS |
| 19 | Policy Mandate v2.0 flat schema (ap2_version:"2.0", all required fields) | ✅ PASS |
| 20 | Category: `immigration` (immigration_visa in hub) | ✅ PASS |

## Calculation Verification

| # | Check | Result |
|---|---|---|
| 21 | AC21 portability: USCIS receipt (not approval) triggers eligibility | ✅ PASS |
| 22 | 60-day grace period after I-94 expiry modeled | ✅ PASS |
| 23 | Unlawful presence >180 days → 3yr bar; >365 days → 10yr bar | ✅ PASS |
| 24 | H-1B max 6 years (+ AC21 extensions if I-140 approved) | ✅ PASS |
| 25 | 3-year financial table: salary delta + signing bonus − attorney/USCIS fees | ✅ PASS |

---

**Spot check:** current $150K, new $180K, $10K signing bonus, $3,000 attorney, $730 USCIS, employer pays all, AC21 portability strategy.  
- Year 1 net gain: ($180K − $150K) + $10K signing − $3,730 fees = $36,270 ✅  
- Risk: portability valid on USCIS receipt → risk_level = low (no gap) ✅
