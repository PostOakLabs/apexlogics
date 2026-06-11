# QA Scorecard — AL-149 · QSBS §1202 Exclusion Estimator

| # | Check | Status |
|---|---|---|
| 1 | Single `.html` file, all CSS/JS inline | ✅ |
| 2 | Google Fonts only | ✅ |
| 3 | Zero `fetch`/`async`/`WebWorker` | ✅ |
| 4 | No `localStorage`, `cookies`, `IndexedDB` | ✅ |
| 5 | PII banner exact text present | ✅ |
| 6 | Nav: single `← All Tools` pill → `../../index.html` | ✅ |
| 7 | No partner nav pills | ✅ |
| 8 | Logo: amber #E8A838 | ✅ |
| 9 | Footer: `About · CC BY 4.0 · AL-149 · Data: ...` | ✅ |
| 10 | No partner links in footer | ✅ |
| 11 | Export order: Markdown FIRST, AP2 SECOND | ✅ |
| 12 | AP2Schema.validate() before createObjectURL | ✅ |
| 13 | `mandate_type: "qsbs_exclusion_record"` | ✅ |
| 14 | `ap2_version: "2.0"` flat schema | ✅ |
| 15 | No multilanguage toggle | ✅ |
| 16 | `_lastResult = null` pattern | ✅ |
| 17 | All 4 acquisition tiers modeled (50/75/100/100%) | ✅ |
| 18 | Tier tied to correct statutory date ranges | ✅ |
| 19 | AMT preference item flagged for pre-2010 tiers | ✅ |
| 20 | $10M (or 10× basis) cap modeled | ✅ |
| 21 | 6-item eligibility checklist (C-corp, orig issue, active biz, etc.) | ✅ |
| 22 | >5-year hold requirement enforced | ✅ |
| 23 | Gross assets ≤$50M check | ✅ |
| 24 | State non-conformity warning when state rate > 0 | ✅ |
| 25 | Downstream routing: AL-147, AL-148, AL-116 | ✅ |
| 26 | manifest.json: al_id, sister_suite, consulting_site | ✅ |

**Result: 26/26 — PASS**

## Calc Verification (Manual)

Inputs: Jan 2011 stock (100% tier), $50K basis, $2M proceeds, 20% LTCG, 0% state
- Gain = $1,950,000
- Cap = max($10M, 10×$50K=$500K) = $10M → cap not hit
- Excluded gain = $1,950,000 × 100% = $1,950,000
- Federal tax without: $1,950,000 × 20% = $390,000
- Federal tax with: $0 × 20% = $0
- Saving = $390,000 ✅

Pre-2010 tier check (50%):
- Excluded = $1,950,000 × 50% = $975,000
- Taxable = $975,000 × 20% = $195,000
- Saving = $195,000 ✅
- AMT pref flagged ✅
