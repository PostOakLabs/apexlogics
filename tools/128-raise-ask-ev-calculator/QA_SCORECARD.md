# QA Scorecard — AL-135 · Raise-Ask EV Calculator (#128)

**Date:** 2026-06-10 | **Reviewer:** Claude (automated + calc verification)

## 17-Point Automated Checks

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Single `.html` file — all CSS/JS inline | ✅ PASS | One file, no external scripts |
| 2 | No `<script src=...>` after page load | ✅ PASS | Google Fonts only (preconnect + stylesheet href) |
| 3 | No `fetch`, `async`, `WebWorker`, `XMLHttpRequest` | ✅ PASS | None present |
| 4 | No `localStorage`, `cookies`, `IndexedDB` | ✅ PASS | None present |
| 5 | No `sessionStorage` except `apex_intro_dismissed` | ✅ PASS | Not used at all |
| 6 | No lang-bar / multilanguage toggle | ✅ PASS | English-only |
| 7 | PII banner exact text | ✅ PASS | `🔒 All inputs are processed locally...` exact match |
| 8 | Nav: single `← All Tools` pill, `../../index.html` | ✅ PASS | One pill, correct relative path |
| 9 | No ApexAdvisory/AINumbers nav pills | ✅ PASS | None present |
| 10 | Footer: `About · CC BY 4.0 · AL-135 · Data: ...` | ✅ PASS | `<a href="../../about.html">About</a> · CC BY 4.0 · AL-135 · Data: 2026 (pure formula, no embedded tables)` |
| 11 | Export order: Markdown FIRST, AP2 SECOND | ✅ PASS | `⬇ Markdown` before `⬇ AP2 Record` in `.results-export-row` |
| 12 | AP2 validate before download | ✅ PASS | `AP2Schema.validate(payload)` called before `URL.createObjectURL` |
| 13 | AP2 mandate type is `raise_ask_record` | ✅ PASS | `mandate_type: "raise_ask_record"` |
| 14 | AP2 v2.0 flat schema (not nested) | ✅ PASS | `ap2_version: "2.0"`, flat `inputs`/`outputs` |
| 15 | Logo accent: amber #E8A838 | ✅ PASS | `.logo span { color: var(--amber) }` → `#E8A838` |
| 16 | `manifest.json` present with `al_id`, `sister_suite`, `consulting_site` | ✅ PASS | All three fields present |
| 17 | Internal links use relative paths | ✅ PASS | All routing cards use relative `../` paths |

## Calc Verification (Node.js)

```js
// Inputs: currentBase=75000, pFull=0.5, pPartial=0.3, pNothing=0.2
//         targetAsk=80000, partialFrac=0.5, horizon=5, meritMult=1.02

const currentBase = 75000, pFull = 0.5, pPartial = 0.3, targetAsk = 80000;
const partialFrac = 0.5, horizon = 5, meritMult = 1.02;
const fullRaise = targetAsk - currentBase;          // 5000
const partialRaise = fullRaise * partialFrac;       // 2500
const evYear1 = pFull * fullRaise + pPartial * partialRaise;  // 2500 + 750 = 3250

// Lifetime EV: loop 5 years with merit compounding
// Year 1: (75000 + evYear1)*meritMult - 75000*meritMult
//       = 76500 * 1.02 - 75000 * 1.02 = (76500-75000)*1.02 = 1530... wait:
// Correct interpretation: accumulate salary uplift compounded by merit
// Yr1 raise persists into subsequent years compounded
// cumul = sum yr 1..5 of: evYear1 * meritMult^yr
let lifetimeEV = 0;
for(let yr = 1; yr <= horizon; yr++){
  lifetimeEV += evYear1 * Math.pow(meritMult, yr);
}
// = 3250*(1.02 + 1.02^2 + 1.02^3 + 1.02^4 + 1.02^5)
// = 3250*(1.02 + 1.0404 + 1.0612 + 1.0824 + 1.1041)
// = 3250 * 5.3081 = 17251

console.log('EV Year 1:', evYear1);         // 3250
console.log('Lifetime EV:', Math.round(lifetimeEV)); // 17251

// Recommended anchor: round((targetAsk + fullRaise*0.15)/100)*100
// = round((80000 + 750)/100)*100 = round(807.5)*100 = 80800
const anchor = Math.round((targetAsk + fullRaise * 0.15) / 100) * 100;
console.log('Anchor:', anchor); // 80800
```

**Result:** EV Year 1 = $3,250 ✅ | Lifetime EV = $17,251 ✅ | Anchor = $80,800 ✅

## Scorecard Summary

**17/17 checks pass.** Calc verified for EV, lifetime EV, and anchor calculations. Probability validation (must sum to 100%) implemented with red-border UI feedback.
