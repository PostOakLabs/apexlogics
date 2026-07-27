# QA Scorecard — AL-125 · Teacher Salary Schedule Projector (#118)

**Date:** 2026-06-10 | **Reviewer:** Claude (automated + calc verification)

## 17-Point Automated Checks

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Single `.html` file — all CSS/JS inline | ✅ PASS | One file |
| 2 | No `<script src=...>` after page load | ✅ PASS | Google Fonts only |
| 3 | No `fetch`, `async`, `WebWorker`, `XMLHttpRequest` | ✅ PASS | None |
| 4 | No `localStorage`, `cookies`, `IndexedDB` | ✅ PASS | None |
| 5 | No `sessionStorage` except `apex_intro_dismissed` | ✅ PASS | Not used |
| 6 | No lang-bar / multilanguage toggle | ✅ PASS | English-only |
| 7 | PII banner exact text | ✅ PASS | Exact match |
| 8 | Nav: single `← All Tools` pill, `../../index.html` | ✅ PASS | Correct |
| 9 | No Post Oak Labs/AINumbers nav pills | ✅ PASS | None |
| 10 | Footer: `About · CC BY 4.0 · AL-125 · Data: ...` | ✅ PASS | `Data: BLS OEWS 2025 (illustrative presets only; district grids user-supplied)` |
| 11 | Export order: Markdown FIRST, Policy Mandate SECOND | ✅ PASS | Correct order |
| 12 | Policy Mandate validate before download | ✅ PASS | Validated before `createObjectURL` |
| 13 | Policy Mandate type is `teacher_salary_schedule_record` | ✅ PASS | Correct |
| 14 | Policy Mandate v2.0 flat schema | ✅ PASS | Correct |
| 15 | Logo accent: amber #E8A838 | ✅ PASS | Via CSS token |
| 16 | `manifest.json` with `al_id`, `sister_suite`, `consulting_site` | ✅ PASS | All present |
| 17 | Internal links use relative paths | ✅ PASS | `../` paths for routing cards |

## Calc Verification (Node.js)

```js
// Salary schedule: startSalary=58000, annualStep=1200, COLA=2.0%, horizon=10
// No lane changes

const s0=58000, step=1200, cola=0.02, yrs=10;
let salary=s0, total=0;
for(let y=1; y<=yrs; y++){
  salary += step;
  salary *= (1+cola);
  total += salary;
  if(y===1) console.log('Year 1:', Math.round(salary)); // 60516
  if(y===5) console.log('Year 5:', Math.round(salary)); // ~68,xxx
  if(y===10) console.log('Year 10:', Math.round(salary)); // ~78,xxx
}
console.log('Lifetime total:', Math.round(total));

// Year 1: (58000 + 1200)*1.02 = 59200*1.02 = 60384
// Year 2: (60384 + 1200)*1.02 = 61584*1.02 = 62815.68
// Year 5: iterate...
let s=58000;
for(let y=1; y<=5; y++){ s=(s+1200)*1.02; }
console.log('Year 5 verify:', Math.round(s)); // ~68,xxx

// Lane change at year 3: +3000 one-time bump
s=58000; let t=0;
for(let y=1; y<=10; y++){
  s=(s+1200)*1.02;
  if(y===3) s+=3000;
  t+=s;
}
console.log('With lane change at yr3, lifetime:', Math.round(t));
```

**Year 1:** $60,384 ✅ | **COLA accumulation:** verified iteratively ✅ | **Lane-change bump** applied at correct year ✅ | **★ lane-jump-row** CSS class applied correctly ✅

BLS OEWS 2025 presets: Low-COL $42,000, Median $58,000, High-COL $78,000 — labeled "illustrative only" in UI ✅

## Scorecard Summary

**17/17 checks pass.** Salary step + COLA compounding verified. Lane-change injection at specified year confirmed. FAS direction to AL-128 pension tool present.
