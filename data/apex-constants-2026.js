/* ============================================================================
   apex-constants-2026.js — ApexLogics canonical federal constants, TAX YEAR 2026
   Single source of truth (CONTRACT §3.5 / CG-29). Canonical location: repo/data/
   (mirrors AINumbers repo/data/ convention). Tools inline the relevant block
   VERBATIM and stamp `Data: ... 2026` in footer + data_vintage.
   DO NOT hard-code a covered constant at a different value for 2026 anywhere.

   Verification legend:
     [V]  Verified against authoritative source on 2026-06-13.
     [S]  Statutorily stable (rate fixed in code; low churn) — confirm at rollover.

   Sources (2026): IRS Rev. Proc. 2025-32 (brackets/std ded/AMT/QBI/LTCG),
   IRS Notice 2025-67 (retirement limits), IRS Rev. Proc. 2025-19 (HSA),
   SSA 2026 COLA fact sheet (wage base), IRS IR-2026 (mileage 72.5¢),
   ED DCL GEN-26-01 (Pell), VA AY2025-26/FY2026 (GI Bill), P.L. 119-21 / OBBBA.
   ============================================================================ */

const APEX_2026 = {

  /* --- Rollover anchor -------------------------------------------------- */
  CURRENT_YEAR: 2026,               // [S] vintage anchor, not read from the clock (AL-CI-HASHDOMAIN) — bump same day as every other value in this file at annual rollover; enforced by check-constants-vintage.mjs

  /* --- Social Security / FICA / SE tax --------------------------------- */
  SS_WAGE_BASE: 184500,            // [V] SSA 2026 (was 176,100 in 2025)
  FICA_SS_RATE: 0.062,             // [S]
  FICA_MEDICARE_RATE: 0.0145,      // [S]
  ADDL_MEDICARE_RATE: 0.009,       // [S] above $200k single / $250k MFJ
  ADDL_MEDICARE_THRESHOLD: { single: 200000, mfj: 250000 }, // [S]
  SE_TAX_RATE: 0.153,              // [S]
  SE_NET_FACTOR: 0.9235,           // [S] SE tax applies to 92.35% of net SE income

  /* --- Standard deduction --------------------------------------------- */
  STD_DEDUCTION: { single: 16100, mfj: 32200, hoh: 24150 }, // [V] Rev. Proc. 2025-32

  /* --- Federal income tax brackets [upper limit, rate] ---------------- */
  FED_BRACKETS: {                  // [V] Rev. Proc. 2025-32
    single: [[12400,0.10],[50400,0.12],[105700,0.22],[201775,0.24],[256225,0.32],[640600,0.35],[Infinity,0.37]],
    mfj:    [[24800,0.10],[100800,0.12],[211400,0.22],[403550,0.24],[512450,0.32],[768700,0.35],[Infinity,0.37]]
  },
  SUPPLEMENTAL_WAGE_RATE: { under1M: 0.22, over1M: 0.37 }, // [S]

  /* --- Capital gains -------------------------------------------------- */
  LTCG_BREAKPOINTS: {              // [V] Rev. Proc. 2025-32 §3.03
    single: { zeroTo: 49450, fifteenTo: 545500 },   // 20% above fifteenTo
    mfj:    { zeroTo: 98900, fifteenTo: 613700 },
    hoh:    { zeroTo: 66200, fifteenTo: 579600 },
    mfs:    { zeroTo: 49450, fifteenTo: 306850 }
  },
  NIIT_RATE: 0.038,                // [S] over $200k single / $250k MFJ

  /* --- AMT (2026) ----------------------------------------------------- */
  AMT: {                           // [V] Rev. Proc. 2025-32
    exemption: { single: 90100, mfj: 140200, mfs: 70100 }, // [V]
    phaseoutStart: { single: 500000, mfj: 1000000 },// [V]
    rate28Threshold: 244500,       // [V] 28% applies above this AMTI
    phaseoutRate: 0.50             // [V] OBBBA
  },

  /* --- QBI §199A (2026, OBBBA-permanent) ------------------------------ */
  QBI: {                           // [V]
    threshold: { single: 201775, mfj: 403500 },
    phaseInRange: { single: 75000, mfj: 150000 },
    minDeductionFloor: 400,        // if QBI >= $1,000 and material participation
    rate: 0.20
  },

  /* --- Retirement contribution limits (2026) -------------------------- */
  DEFERRAL_401K_403B_457B: 24500,  // [V] Notice 2025-67
  CATCHUP_50_PLUS: 8000,           // [V]
  CATCHUP_60_TO_63: 11250,         // [V] SECURE 2.0 super catch-up
  ROTH_CATCHUP_WAGE_THRESHOLD: 150000, // [V] forced-Roth catch-up if prior-yr wages exceed (2026)
  SECTION_415C_LIMIT: 72000,       // [V] DC plan annual additions
  SEP_IRA_LIMIT: 72000,            // [V] lesser of 25% comp or this
  SEP_COMP_CAP: 360000,            // [V]
  IRA_LIMIT: 7500,                 // [V] Notice 2025-67
  IRA_CATCHUP_50_PLUS: 1100,       // [V] Notice 2025-67 (up from $1,000 in 2025)

  /* --- Health accounts (2026) ----------------------------------------- */
  HSA: { individual: 4400, family: 8750, catchup55: 1000 }, // [V] Rev. Proc. 2025-19
  DEPENDENT_CARE_FSA: { max: 7500, mfs: 3750 },             // [V] OBBBA §129, eff 2026
  CDCTC: { expenseCap1: 3000, expenseCap2plus: 6000, rateHigh: 0.35, rateLow: 0.20 }, // [S]

  /* --- Mileage -------------------------------------------------------- */
  MILEAGE_BUSINESS: 0.725,         // [V] IRS 2026 (72.5¢)

  /* --- Education assistance ------------------------------------------- */
  SECTION_127_LIMIT: 5250,         // [S] employer educational assistance

  /* --- Pell (award year 2026-27) -------------------------------------- */
  PELL: { max: 7395, min: 740 },   // [V] ED DCL GEN-26-01

  /* --- OBBBA student loans (P.L. 119-21, eff. July 1, 2026) ----------- */
  OBBBA_LOANS: {                   // [V]
    gradAnnual: 20500, gradLifetime: 100000,
    professionalAnnual: 50000, professionalLifetime: 200000,
    parentPlusAnnual: 20000, parentPlusLifetime: 65000,
    overallLifetimeAggregate: 257500,   // includes Grad PLUS (ED reversal); Grad PLUS eliminated for new borrowers
    publicLaw: "P.L. 119-21"
  },
  RAP: {                           // [V] Repayment Assistance Plan
    incomePctMin: 0.01, incomePctMax: 0.10,  // sliding 1%–10% of AGI
    monthlyFloor: 10, perDependentReduction: 50, forgivenessYears: 30
  },

  /* --- QSBS §1202 (OBBBA, stock acquired after July 4, 2025) ---------- */
  QSBS_OBBBA: {                    // [V]
    perIssuerCap: 15000000, grossAssetsLimit: 75000000,
    tiers: [{ years: 3, pct: 0.50 }, { years: 4, pct: 0.75 }, { years: 5, pct: 1.00 }]
  },
  QSBS_PRE_OBBBA: { perIssuerCap: 10000000, grossAssetsLimit: 50000000, minYears: 5, pct: 1.00 }, // on/before 7/4/2025

  /* --- GI Bill (Post-9/11 AY2025-26; MGIB Ch.30 FY2026) -------------- */
  GI_BILL: {                       // [V]
    privateAnnualCap: 29920.95,    // [V] Post-9/11 AY2025-26 (eff. Aug 1, 2025)
    booksMonthly: 41.67,           // [S]
    mgibCh30Monthly: 2518          // [V] MGIB Ch.30 full-time FY2026 (eff. Oct 1, 2025)
  }
};

/* Usage: copy the needed block inline into a tool; reference APEX_2026.X.
   At each January rollover (CONTRACT §3.5.3): clone to apex-constants-<year>.js,
   update [V] values from the new IRS/SSA/ED/VA releases, diff every tool. */
