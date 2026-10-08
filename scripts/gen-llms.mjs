#!/usr/bin/env node
/**
 * scripts/gen-llms.mjs — renders llms.txt from suite-registry.json (AL-LLMS-GEN).
 *
 * llms.txt was hand-edited until this script existed, and every hand-edit surface
 * drifted: stale entry titles (#85–#87 and five more at staging time), a version
 * header that said v5.6.7 while the registry had reached v5.13.0, descriptions and
 * handoff lists that had forked from the registry's truth pass, and hand-edit cruft
 * (duplicated "Policy Mandate type:" lines, a misplaced handoff line). This script
 * makes the file a pure render: the registry (read-only here) is the single source
 * of every per-entry line, and everything else is a template constant copied
 * verbatim from the hand-curated file.
 *
 * Division of labor, per the AL-LLMS-GEN row:
 *   GENERATED (registry-derived lines only):
 *     - the "# Suite version / # Last updated / # Tools" masthead lines,
 *     - each shipped entry's heading (display number · AL-ID — registry title),
 *       URL, description, "Policy Mandate type:" join, and "Handoffs out:" join
 *       (slug-shaped downstream_handoff_candidates are normalized to AL-IDs;
 *       legacy composite half-IDs like AL-06 / AL-14 pass through verbatim),
 *     - each showcase entry's heading, URL, description (when the registry has
 *       one; otherwise the blank line the hand-curated file carried), and
 *       "Policy Mandate type:" join.
 *   STATIC (template constants, verbatim from llms.txt @ d9c5f2a, 2026-10-02):
 *     - masthead prose, Summary, How to Use, the OpenChainGraph prose block
 *       (its "Standard v0.8.8" sentence stays static template text in this row —
 *       AL-CG-COVERAGE owns the graph's stale spec_version, and until it lands
 *       check-llms-entries.mjs treats that comparison as a WARN, not a failure),
 *     - the 20 hand-curated category headings and their entry orders,
 *     - the showcase heading, intro, and SC ordering,
 *     - every section from "## Workflows (41)" to the end of the file.
 *
 * Two entry-level static carryovers ride inside TPL because the registry has no
 * field for them today (see TPL.staticDescriptions / TPL.staticExtras):
 *   - AL-108 / AL-109 / AL-110 have no registry description; their existing
 *     llms.txt descriptions are preserved verbatim as fallbacks and lose to a
 *     real registry description the moment one appears;
 *   - AL-187's "Handoffs in:" note and AL-153's terminal-composer handoff note
 *     are hand-authored lines kept verbatim inside their generated blocks.
 *
 * Usage:
 *   node scripts/gen-llms.mjs           # write llms.txt (the render)
 *   node scripts/gen-llms.mjs --check   # CI: exit 1 if llms.txt is stale
 *
 * The registry is NEVER written. Fences: any structural surprise (unknown id,
 * unmappable slug, missing description, set mismatch) aborts the render loudly
 * instead of emitting a silently degraded file.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');

function fail(msg) {
  console.error('gen-llms: ' + msg);
  process.exit(1);
}

// ═══ 1. STATIC TEMPLATE ═════════════════════════════════════════════════════
const TPL = {
 "headTop": [
  "# ApexLogics — Deterministic Decision Engines for People, Creators, and Agents",
  "# https://apexlogics.org",
  "# Publisher: Post Oak Labs — https://postoaklabs.com",
  "# Sister suites: AINumbers.co (markets & institutions) — https://ainumbers.co · OpenChainScience (science & evidence)",
  "# License: CC BY 4.0",
  "# Policy Mandate Protocol: OpenChainGraph decision-record (org.apexlogics namespace) — not Google's Agent Payments Protocol, which ApexLogics tools do not emit"
 ],
 "privacyLine": "# Privacy: Zero PII. All computation client-side. No accounts, no tracking.",
 "summary": "## Summary\n\nApexLogics is deterministic decision engines for people, creators, and agents: 185 browser-based tools covering career and education economics, including credential ROI, education financing, compensation analysis, career transitions, licensing, workforce development, immigration, equity tax, and freelance tax planning. Every tool is a single self-contained HTML file with zero network calls after load and zero PII collection. All tools emit Policy Mandates (JSON) and Markdown reports for agent and human handoff. 41 multi-tool workflows chain tools into end-to-end decision journeys at /workflows/. 9 guides at /guides/.",
 "howto": "## How to Use This File\n\nEach tool entry below gives: display number, AL-ID, title, URL, one-line description, Policy Mandate type emitted, and downstream handoff candidates. Full machine-readable metadata (tags, personas, journeys, data vintage): https://apexlogics.org/suite-registry.json",
 "ocg": "## OpenChainGraph (machine-readable discovery)\n\nApexLogics conforms to the OpenChainGraph Standard v0.8.8 (https://postoaklabs.github.io/chaingraph/). Every tool emits a hash-anchored, chainable Policy Mandate artifact carrying a verifiable SHA-256 execution_hash over canonical {policy_parameters, output_payload}, and captures an inbound parent artifact via the ?ap2= handoff for runtime chaining (chain.parent_hashes). Namespace: org.apexlogics. chaingraph_version is the single version anchor; the legacy ap2_mandate_type field is retained per-artifact as a deprecated alias, and the ap2_version field has been retired (\"Policy Mandate\" is the OCG decision-record type — not Google's Agent Payments Protocol, which ApexLogics tools do not emit).\n- Graph index (every node's mandate_type + consumes/feeds chain edges): https://apexlogics.org/chaingraph/chaingraph.json\n- A2A agent card (declares the x-chaingraph extension): https://apexlogics.org/.well-known/agent-card.json\n- Independent hash verification (MCP tool): verify_execution_hash at https://mcp.apexlogics.org/mcp",
 "categories": [
  {
   "heading": "## Category: Education Path & ROI (30 tools)",
   "ids": [
    "AL-02",
    "AL-26",
    "AL-29",
    "AL-30",
    "AL-31",
    "AL-36",
    "AL-39",
    "AL-48",
    "AL-50",
    "AL-51",
    "AL-52",
    "AL-54",
    "AL-55",
    "AL-56",
    "AL-57",
    "AL-61",
    "AL-62",
    "AL-63",
    "AL-64",
    "AL-65",
    "AL-66",
    "AL-67",
    "AL-68",
    "AL-69",
    "AL-70",
    "AL-71",
    "AL-72",
    "AL-73",
    "AL-182",
    "AL-188"
   ]
  },
  {
   "heading": "## Category: Compensation & Offers (16 tools)",
   "ids": [
    "AL-23",
    "AL-25",
    "AL-33",
    "AL-22",
    "AL-01",
    "AL-04",
    "AL-34",
    "AL-35",
    "AL-37",
    "AL-43",
    "AL-44",
    "AL-45",
    "AL-49",
    "AL-53",
    "AL-189",
    "AL-190"
   ]
  },
  {
   "heading": "## Category: Career Transition & Mobility (7 tools)",
   "ids": [
    "AL-06+16",
    "AL-08+14",
    "AL-24",
    "AL-27",
    "AL-28",
    "AL-38",
    "AL-40"
   ]
  },
  {
   "heading": "## Category: Licensing & Credentials (5 tools)",
   "ids": [
    "AL-03",
    "AL-18",
    "AL-20",
    "AL-10",
    "AL-46"
   ]
  },
  {
   "heading": "## Category: Student Finance & Debt (7 tools)",
   "ids": [
    "AL-17",
    "AL-12",
    "AL-32",
    "AL-13",
    "AL-05",
    "AL-47",
    "AL-183"
   ]
  },
  {
   "heading": "## Category: Workforce Development (6 tools)",
   "ids": [
    "AL-07",
    "AL-11",
    "AL-41",
    "AL-42",
    "AL-184",
    "AL-185"
   ]
  },
  {
   "heading": "## Category: Selected Studies: Methods (5 tools)",
   "ids": [
    "AL-198",
    "AL-197",
    "AL-196",
    "AL-186",
    "AL-187"
   ]
  },
  {
   "heading": "## Category: Immigration & Visa (2 tools)",
   "ids": [
    "AL-09",
    "AL-59"
   ]
  },
  {
   "heading": "## Category: Selected Studies — Education (5 tools)",
   "ids": [
    "AL-74",
    "AL-75",
    "AL-76",
    "AL-77",
    "AL-78"
   ]
  },
  {
   "heading": "## Category: Selected Studies — ESL/TEFL (4 tools)",
   "ids": [
    "AL-79",
    "AL-80",
    "AL-81",
    "AL-82"
   ]
  },
  {
   "heading": "## Category: Selected Studies — History (4 tools)",
   "ids": [
    "AL-83",
    "AL-84",
    "AL-85",
    "AL-86"
   ]
  },
  {
   "heading": "## Category: Selected Studies — Sport Management (4 tools)",
   "ids": [
    "AL-87",
    "AL-88",
    "AL-89",
    "AL-90"
   ]
  },
  {
   "heading": "## Category: Selected Studies — Economics (42 tools)",
   "ids": [
    "AL-91",
    "AL-92",
    "AL-93",
    "AL-94",
    "AL-95",
    "AL-96",
    "AL-97",
    "AL-98",
    "AL-99",
    "AL-100",
    "AL-101",
    "AL-102",
    "AL-103",
    "AL-104",
    "AL-105",
    "AL-106",
    "AL-107",
    "AL-108",
    "AL-109",
    "AL-110",
    "AL-111",
    "AL-112",
    "AL-113",
    "AL-114",
    "AL-115",
    "AL-116",
    "AL-117",
    "AL-118",
    "AL-119",
    "AL-120",
    "AL-121",
    "AL-122",
    "AL-123",
    "AL-124",
    "AL-125",
    "AL-126",
    "AL-127",
    "AL-128",
    "AL-135",
    "AL-136",
    "AL-194",
    "AL-195"
   ]
  },
  {
   "heading": "## Category: Career Transition & Mobility (v5 additions)",
   "ids": [
    "AL-141",
    "AL-143",
    "AL-150",
    "AL-191"
   ]
  },
  {
   "heading": "## Category: Career Transition & Mobility (v4 backfill — Trades)",
   "ids": [
    "AL-129",
    "AL-130",
    "AL-131"
   ]
  },
  {
   "heading": "## Category: Career Transition & Mobility (v4 backfill — Veterans)",
   "ids": [
    "AL-132",
    "AL-133",
    "AL-134"
   ]
  },
  {
   "heading": "## Category: Compensation & Benefits (v4 backfill)",
   "ids": [
    "AL-137",
    "AL-138",
    "AL-139",
    "AL-140"
   ]
  },
  {
   "heading": "## Category: Compensation & Offers (v5 additions)",
   "ids": [
    "AL-142",
    "AL-144",
    "AL-145",
    "AL-146",
    "AL-147",
    "AL-148",
    "AL-149"
   ]
  },
  {
   "heading": "## Category: Immigration & Career (v5 additions)",
   "ids": [
    "AL-151",
    "AL-152",
    "AL-153"
   ]
  },
  {
   "heading": "## Category: Personal Finance & Life Events (24 tools)",
   "ids": [
    "AL-160",
    "AL-161",
    "AL-162",
    "AL-163",
    "AL-164",
    "AL-165",
    "AL-166",
    "AL-167",
    "AL-168",
    "AL-169",
    "AL-170",
    "AL-171",
    "AL-172",
    "AL-173",
    "AL-174",
    "AL-175",
    "AL-176",
    "AL-177",
    "AL-178",
    "AL-179",
    "AL-180",
    "AL-181",
    "AL-192",
    "AL-193"
   ]
  }
 ],
 "showcaseHeading": "## OCG-Industries Showcase (111 exemplars)",
 "showcaseIntro": "\nCurated gallery proving the OpenChainGraph stack renders any industry's provenance/decision problem as a runnable, verifiable chaingraph. Each is a real OCG node with a client-side execution hash. Gallery: https://apexlogics.org/showcase/",
 "scOrder": [
  "SC-01",
  "SC-02",
  "SC-03",
  "SC-04",
  "SC-05",
  "SC-06",
  "SC-07",
  "SC-08",
  "SC-09",
  "SC-10",
  "SC-11",
  "SC-12",
  "SC-13",
  "SC-14",
  "SC-15",
  "SC-16",
  "SC-20",
  "SC-21",
  "SC-27",
  "SC-28",
  "SC-29",
  "SC-30",
  "SC-31",
  "SC-32",
  "SC-33",
  "SC-34",
  "SC-35",
  "SC-36",
  "SC-37",
  "SC-38",
  "SC-39",
  "SC-40",
  "SC-41",
  "SC-42",
  "SC-43",
  "SC-44",
  "SC-45",
  "SC-47",
  "SC-48",
  "SC-49",
  "SC-50",
  "SC-51",
  "SC-58",
  "SC-59",
  "SC-60",
  "SC-61",
  "SC-62",
  "SC-63",
  "SC-64",
  "SC-65",
  "SC-66",
  "SC-67",
  "SC-68",
  "SC-69",
  "SC-70",
  "SC-71",
  "SC-72",
  "SC-73",
  "SC-74",
  "SC-75",
  "SC-76",
  "SC-77",
  "SC-94",
  "SC-95",
  "SC-96",
  "SC-97",
  "SC-98",
  "SC-99",
  "SC-100",
  "SC-101",
  "SC-102",
  "SC-103",
  "SC-104",
  "SC-105",
  "SC-106",
  "SC-107",
  "SC-108",
  "SC-109",
  "SC-110",
  "SC-111",
  "SC-17",
  "SC-18",
  "SC-19",
  "SC-22",
  "SC-23",
  "SC-24",
  "SC-25",
  "SC-26",
  "SC-46",
  "SC-52",
  "SC-53",
  "SC-54",
  "SC-55",
  "SC-56",
  "SC-57",
  "SC-78",
  "SC-79",
  "SC-80",
  "SC-81",
  "SC-82",
  "SC-83",
  "SC-84",
  "SC-85",
  "SC-86",
  "SC-87",
  "SC-88",
  "SC-89",
  "SC-90",
  "SC-91",
  "SC-92",
  "SC-93"
 ],
 "tail": "## Workflows (41)\n\nWF-01 · New Offer Decision Suite — https://apexlogics.org/workflows/new-offer-suite.html\nWF-02 · Grad School Decision Engine — https://apexlogics.org/workflows/grad-school-decision-engine.html\nWF-03 · Career Pivot Playbook — https://apexlogics.org/workflows/career-pivot-playbook.html\nWF-04 · Credentialing Fast-Track — https://apexlogics.org/workflows/credentialing-fast-track.html\nWF-05 · College Financial Planning Suite — https://apexlogics.org/workflows/college-financial-planning-suite.html\nWF-06 · Freelance Leap Calculator — https://apexlogics.org/workflows/freelance-leap-calculator.html\nWF-07 · Career Exit & Restart Planner — https://apexlogics.org/workflows/career-exit-restart-planner.html\nWF-08 · International Career Navigator — https://apexlogics.org/workflows/international-career-navigator.html\nWF-09 · AI Career Transition Playbook — https://apexlogics.org/workflows/ai-career-transition-playbook.html\nWF-10 · Federal Job Decision Suite — https://apexlogics.org/workflows/federal-job-decision-suite.html\nWF-11 · Education Path Decision Engine — https://apexlogics.org/workflows/education-path-decision-engine.html\nWF-12 · Remote Work & Relocation Suite — https://apexlogics.org/workflows/remote-work-relocation-suite.html\nWF-13 · MBA Aspirant Complete Playbook — https://apexlogics.org/workflows/mba-aspirant-playbook.html\nWF-14 · Employer Education Benefit Maximizer — https://apexlogics.org/workflows/employer-education-benefit-maximizer.html\nWF-15 · Law & Professional School Full Journey — https://apexlogics.org/workflows/law-professional-school-journey.html\nWF-16 · Mid-Career Credential Stack Planner — https://apexlogics.org/workflows/mid-career-credential-stack-planner.html\nWF-17 · International MBA Applicant Complete Journey — https://apexlogics.org/workflows/international-mba-complete-journey.html\nWF-18 · LSAT to JD Career Outcome Planner — https://apexlogics.org/workflows/lsat-to-jd-career-planner.html\nWF-19 · MBA Ding → Comeback Planner — https://apexlogics.org/workflows/mba-ding-comeback-planner.html\nWF-20 · 2026 Student Loan Borrower Decision Journey — https://apexlogics.org/workflows/2026-borrower-decision-journey.html\nWF-21 · Course Design Studio — https://apexlogics.org/workflows/course-design-studio.html\nWF-22 · Employer Benefits Decision — https://apexlogics.org/workflows/employer-benefits-decision.html\nWF-23 · Corporate Upskilling ROI — https://apexlogics.org/workflows/corporate-upskilling-roi.html\nWF-24 · AI Displacement & Career Transition — https://apexlogics.org/workflows/ai-displacement-career-transition.html\nWF-25 · Employer Talent Retention — https://apexlogics.org/workflows/employer-talent-retention.html\nWF-26 · Equity Compensation Decisions — https://apexlogics.org/workflows/equity-compensation-decisions.html\nWF-27 · Freelance Tax Lifecycle — https://apexlogics.org/workflows/freelance-tax-lifecycle.html\nWF-28 · Student Loan Payoff Decisions — https://apexlogics.org/workflows/student-loan-payoff-decisions.html\nWF-29 · Sandwich Generation / Career Break — https://apexlogics.org/workflows/sandwich-generation-career-break.html\nWF-30 · Teacher Career & Compensation — https://apexlogics.org/workflows/teacher-career-compensation.html\nWF-31 · Skilled Trades Career Builder — https://apexlogics.org/workflows/skilled-trades-career-builder.html\nWF-32 · Veteran Transition & GI Bill Planner — https://apexlogics.org/workflows/veteran-transition-gi-bill.html\nWF-33 · Am I Underpaid? Stay-and-Ask — https://apexlogics.org/workflows/underpaid-stay-and-ask.html\nWF-34 · Working Parent Childcare Planner — https://apexlogics.org/workflows/working-parent-childcare.html\nWF-35 · Nurse Shift & Travel Comp Optimizer — https://apexlogics.org/workflows/nurse-shift-travel-comp.html\nWF-36 · Job Separation Financial Playbook — https://apexlogics.org/workflows/job-separation-financial-playbook.html\nWF-37 · Self-Employment Tax Optimizer — https://apexlogics.org/workflows/self-employment-tax-optimizer.html\nWF-38 · Equity Exit Planning — https://apexlogics.org/workflows/equity-exit-planning.html\nWF-39 · QSBS + Federal Career Transition — https://apexlogics.org/workflows/qsbs-federal-career-transition.html\nWF-40 · Immigration Career Planner — https://apexlogics.org/workflows/immigration-career-planner.html\nWF-41 · Program Evaluation Journey — https://apexlogics.org/workflows/program-evaluation-journey.html\n\n## OpenChainGraphs (13 persona journeys)\n\nEach OpenChainGraph bundles one persona's decision journeys into a guided, Policy-Mandate-verified chain where each step's execution hash feeds the next.\n\nOpenChainGraph Hub — https://apexlogics.org/chaingraph/chaingraph-hub.html\nWorker / Employee — https://apexlogics.org/chaingraph/worker.html\nFreelancer / Self-Employed — https://apexlogics.org/chaingraph/freelancer.html\nFederal Employee — https://apexlogics.org/chaingraph/federal-employee.html\nVeteran — https://apexlogics.org/chaingraph/veteran.html\nSkilled Trades — https://apexlogics.org/chaingraph/trades.html\nNurse / Healthcare — https://apexlogics.org/chaingraph/nurse-healthcare.html\nStudent — https://apexlogics.org/chaingraph/student.html\nGrad / Professional Applicant — https://apexlogics.org/chaingraph/grad-applicant.html\nParent / College Funder — https://apexlogics.org/chaingraph/parent.html\nEducator / Teacher — https://apexlogics.org/chaingraph/educator.html\nImmigrant / Visa Holder — https://apexlogics.org/chaingraph/immigrant-visa-holder.html\nNew Parent / Caregiver — https://apexlogics.org/chaingraph/new-parent-caregiver.html\nEmployer (HR/People) — https://apexlogics.org/chaingraph/employer.html\n\nMachine-readable graph index (LLMEO surface): https://apexlogics.org/chaingraph/chaingraph.json\n\n## Guides (9)\n\nEducation Path Hub — https://apexlogics.org/guides/education-path-hub.html\nCompensation & Offers Hub — https://apexlogics.org/guides/compensation-offers-hub.html\nCareer Transition Hub — https://apexlogics.org/guides/career-transition-hub.html\nLicensing & Credentials Hub — https://apexlogics.org/guides/licensing-credentials-hub.html\nStudent Finance Hub — https://apexlogics.org/guides/student-finance-hub.html\nWorkforce Development Hub — https://apexlogics.org/guides/workforce-development-hub.html\nImmigration & Visa Hub — https://apexlogics.org/guides/immigration-visa-hub.html\n2026 Student Loan Changes (OBBBA) — https://apexlogics.org/guides/student-loans-2026.html\nTeaching & Instruction — https://apexlogics.org/guides/teaching-instruction-hub.html\n\n## Policy Mandate Types (187 active across the suite)\n\ncredential_roi_evaluation · fafsa_sai_estimate · graduate_school_roi_record\nbenefits_election_record · offer_negotiation_record · automation_exposure_score\ncareer_resilience_score · career_pivot_assessment · career_transition_record\nseverance_decision_record · job_search_roi_record · career_break_record\nhuman_capital_assessment · cpd_credit_record · exam_pathway_plan\nscholarship_pipeline_plan · workforce_program_roi · apprenticeship_match_record\nmba_roi_evaluation · test_prep_roi_record · international_student_cost_record\nparent_college_roi_record · equity_compensation_record · loan_repayment_record\nfreelance_total_cost_record · education_savings_record · total_comp_record\ngeo_arbitrage_record · visa_strategy_record · license_reciprocity_record\nai_skills_premium_record · federal_comp_record · education_path_record\nremote_tax_record · noncompete_risk_record · professional_degree_record\nmilitary_civilian_record · workforce_pell_record · workforce_pell_credential_rank\nnet_worth_trajectory_record · signing_bonus_record · gig_income_record\ncert_renewal_forecast_record · isa_loan_record · dual_enrollment_record\ndeferred_comp_457b_record · tutor_roi_record · test_retake_record\nmba_portfolio_record · tuition_reimbursement_record · phd_pivot_record\nlaw_school_roi_record · test_choice_record · exec_mba_record\nstem_opt_record · english_test_choice_record · lsat_tier_record\nmba_scholarship_record · consulting_roi_record · mba_yield_record\ndual_degree_record · online_mba_record · mba_waitlist_record\ndeferred_mba_record\nsales_ote_record · counter_offer_record · relocation_package_record · dual_career_record\ninternship_roi_record · cc_transfer_record · grad_cert_record · adult_learner_record\nnursing_ladder_record · side_hustle_transition_record · l1_spanish_interference_record · game_theory_record\ntrade_wage_progression_record · trade_cert_roi_record · contractor_launch_record\ngi_bill_benefit_record · skillbridge_credential_record · veteran_income_bridge_record\ndependent_care_fsa_cdctc_record · parental_leave_income_record · travel_nurse_comp_record · shift_differential_optimizer_record\n\nstaking_airdrop_income_record · rmd_withdrawal_sequence_record · roth_conversion_window_record\nirmaa_bracket_record · medicare_plan_comparison_record · medicare_oop_exposure_record\nhomeownership_tco_record · home_affordability_record · rental_deal_screen_record\nrental_depreciation_shield_record · business_valuation_record · owner_salary_normalization_record\nbusiness_sale_tax_record · marital_asset_division_record · spousal_support_range_record\nqdro_pension_split_record · net_estate_probate_record · estate_tax_liability_record\nannual_gift_exclusion_record · ltc_cost_estimate_record · medicaid_spend_down_record\nagency_salability_record · ai_content_disclosure_conformance_record · anticounterfeit_consumer_check_record\npuzzle_gate_record · autonomous_command_audit_record · branching_fiction_record\ncbam_declaration_readiness_record · cbam_filing_pack_record · cbdc_interop_handoff_record\ncertificate_retirement_check_record · chaingraph_sonification_record · chart_endpoint_lineage_record\ncicd_build_provenance_record · civic_decision_record · claim_source_audit_record\nclaims_lifecycle_walk_record · commit_reveal_dice_record · consent_scope_check_record\ncontent_credential_binding_record · content_credential_verification_record · contract_lifecycle_diff_record\ncross_vendor_provenance_interop_record · cte_kde_lot_record · customs_declaration_lineage_record\ndataset_certification_record · deepfake_consumer_verification_record · digital_product_passport_lineage_record\ndispenser_readiness_record · document_integrity_anchor_record · ebl_title_transfer_record\nedition_revision_ledger_record · einvoice_clearance_vida_record · eudi_diploma_readiness_record\neudr_dds_validation_record · eudr_export_pack_record · eudr_supply_chain_risk_record\nfood_traceability_fsma204_record · handoff_integrity_record · generative_art_record\nhedge_execution_lineage_record · interconnection_readiness_record · iso20022_message_lint_record\nletter_of_credit_document_set_record · lore_canon_boundary_record · mandate_audit_chain_record\nmaterial_passport_lineage_record · mcp_server_attestation_record · mesh_descriptor_record\nmultiparty_supply_chain_interop_record · news_asset_provenance_record · openbadge3_lint_record\npa_metrics_record · payer_ai_decision_audit_record · payoff_instruction_binding_record\npharma_serialization_custody_record · pipeline_run_fingerprint_record · prior_auth_deadline_record\nprofessional_skills_lineage_record · proof_of_play_record · rail_decision_provenance_record\nrecall_pack_record · reconciliation_evidence_record · remix_lineage_record\nreplication_receipt_record · reserve_attestation_integrity_record · pi_barcode_verification_record · reversal_detector_record\nsbom_dependency_provenance_record · scenario_constraint_cert_record · skills_verification_gate_record\nsource_chain_integrity_record · synthesis_route_continuity_record · taxonomy_green_capex_record\ntelemetry_ack_audit_record · title_chain_continuity_record · training_path_attestation_record\ntreasury_memo_lineage_record · trid_tolerance_cure_record · vex_disclosure_timeline_record\nworld_state_checkpoint_record\nNote: the suite spans two Policy Mandate schema generations — v1.0 (nested mandates, tools #01–#33-era) and v2.0 (flat mandates, tools #29+). Canonical reconciliation lives in the build contract; each tool validates its emitted type before download.\n\n## Technical Constraints (All Tools)\n\n- Single self-contained .html file per tool. No external dependencies post-load.\n- Zero network calls. No fetch, XHR, WebWorker, or CDN after page load.\n- Zero PII. No storage, logging, or transmission of personal data.\n- sessionStorage: apex_lang key only (UI language preference).\n- Fonts: Google Fonts (DM Serif Display, Sora, JetBrains Mono) loaded at page open only.\n- i18n: EN/ES/FR/AR/PT/Chinese language toggle on every tool.\n- Policy Mandate export: JSON + Markdown download. Schema validation runs before any download.\n- PII banner: \"All inputs are processed locally in your browser. Nothing is transmitted, stored, or logged.\"\n- License: CC BY 4.0. Source readable and attribution-ready.\n\n## About\n\nApexLogics is built by Post Oak Labs (https://postoaklabs.com).\nFintech companion suite: AINumbers.co by Post Oak Labs (https://ainumbers.co).\nSuite registry (machine-readable): https://apexlogics.org/suite-registry.json",
 "staticDescriptions": {
  "AL-108": "OBBBA 2025: compare Repayment Assistance Plan (1–10% AGI sliding scale, $10 floor, 30-yr forgiveness) vs. Standard 10-year plan. Tab 2: PSLF RAP path. Effective July 1, 2026.",
  "AL-109": "OBBBA 2025 Grad PLUS caps: $20,500/yr grad, $50,000/yr professional. Models federal eligibility, annual funding gap, and private loan gap-fill strategies with DTI check.",
  "AL-110": "OBBBA 2025 expands 529 qualified expenses to CDL/vocational, CPA/bar exam fees, license renewal, CPE/CE, and K-12 up to $20k/yr. Eligibility checker + contribution planner with state deduction benefit."
 },
 "staticExtras": {
  "AL-187": [
   "Handoffs in: AL-88"
  ],
  "AL-153": [
   "Handoffs out: (none — terminal composer tool)"
  ]
 }
};

// ═══ 2. REGISTRY (read-only) ════════════════════════════════════════════════
function loadRegistry() {
  const raw = readFileSync(join(ROOT, 'suite-registry.json'), 'utf8').replace(/\x00+$/, '');
  const reg = JSON.parse(raw);
  const byId = new Map();
  const bySlugOrToolId = new Map();
  for (const t of reg.tools) {
    if (byId.has(t.al_id)) fail('duplicate al_id in suite-registry.json: ' + t.al_id);
    byId.set(t.al_id, t);
    for (const k of ['slug', 'tool_id']) {
      if (t[k]) bySlugOrToolId.set(t[k], t.al_id);
    }
  }
  return { reg, byId, bySlugOrToolId };
}

function normalizeHandoff(c, bySlugOrToolId) {
  // "AL-xx" passes through untouched — including legacy composite half-IDs
  // (AL-06, AL-14) that predate the merged slugs; anything else must be a
  // slug/tool_id resolvable to a shipped AL-ID.
  if (c.startsWith('AL-')) return c;
  const mapped = bySlugOrToolId.get(c);
  if (!mapped) fail('unmappable downstream_handoff_candidates entry "' + c + '" — add the tool or fix the registry value');
  return mapped;
}

function descriptionFor(t) {
  const d = (t.description || '').trim();
  if (d) return d;
  const fb = TPL.staticDescriptions[t.al_id];
  if (fb !== undefined) return fb;
  fail(t.al_id + ' has no registry description and no static fallback — refusing to render an entry without one');
}

// ═══ 3. RENDER ══════════════════════════════════════════════════════════════
function render({ reg, byId, bySlugOrToolId }) {
  const out = [];
  const push = (...ls) => out.push(...ls);

  // Masthead: six static lines, three registry-derived lines, privacy line.
  push(...TPL.headTop);
  push('# Suite version: registry v' + reg.version + ' · spec v' + reg.spec_version + ' · contract v' + reg.contract_version);
  push('# Last updated: ' + reg.last_updated);
  push('# Tools: ' + reg.tools_count_shipped + ' shipped · ' + reg.showcase_count + ' showcase exemplars · ' + reg.tools_count_deferred_v4plus + ' deferred · ' + reg.tools_count_proposed + ' proposed');
  push(TPL.privacyLine);
  push('');

  push(TPL.summary, '');
  push(TPL.howto, '');
  push(TPL.ocg, '');

  // Shipped-tool sections: hand-curated headings + orders, registry-derived entries.
  const seen = new Set();
  for (const cat of TPL.categories) {
    push(cat.heading, '');
    const claim = cat.heading.match(/\((\d+) tools\)/);
    if (claim && parseInt(claim[1], 10) !== cat.ids.length) {
      fail('template category heading "' + cat.heading + '" claims ' + claim[1] + ' tools but lists ' + cat.ids.length + ' (verify-counts.mjs would flag this too)');
    }
    for (const id of cat.ids) {
      const t = byId.get(id);
      if (!t) fail('template lists ' + id + ' but suite-registry.json has no such tool');
      if (t.category === 'showcase') fail(id + ' is a showcase tool but sits in a shipped category section');
      if (seen.has(id)) fail(id + ' appears in more than one template category section');
      seen.add(id);
      push('### ' + t.display_number + ' · ' + t.al_id + ' — ' + t.title);
      push('URL: ' + t.url);
      push(descriptionFor(t));
      push('Policy Mandate type: ' + (t.ap2_mandate_types || []).join(', '));
      for (const extra of (TPL.staticExtras[t.al_id] || [])) push(extra);
      const ho = (t.downstream_handoff_candidates || []).map(c => normalizeHandoff(c, bySlugOrToolId));
      if (ho.length) push('Handoffs out: ' + ho.join(', '));
      push('');
    }
  }
  const shipped = reg.tools.filter(t => t.category !== 'showcase').map(t => t.al_id);
  const notListed = shipped.filter(id => !seen.has(id));
  if (notListed.length || seen.size !== shipped.length) {
    fail('shipped set mismatch: ' + shipped.length + ' registry tools vs ' + seen.size + ' template slots' + (notListed.length ? '; missing from template: ' + notListed.join(', ') : ''));
  }

  // Showcase section: registry-derived entries in the hand-curated SC order.
  push(TPL.showcaseHeading);
  push(TPL.showcaseIntro);
  push('');
  for (const id of TPL.scOrder) {
    const t = byId.get(id);
    if (!t) fail('template lists ' + id + ' but suite-registry.json has no such showcase tool');
    if (t.category !== 'showcase') fail(id + ' is not a showcase tool but sits in the showcase section');
    push('### ' + t.al_id + ' — ' + t.title);
    push('URL: ' + t.url);
    const d = (t.description || '').trim();
    push(d || '');
    push('Policy Mandate type: ' + (t.ap2_mandate_types || []).join(', '));
    push('');
  }
  if (reg.showcase_count !== TPL.scOrder.length) {
    fail('registry showcase_count ' + reg.showcase_count + ' != template SC order length ' + TPL.scOrder.length);
  }

  // Tail: workflows, persona journeys, guides, mandate-type index, technical
  // constraints, about — all verbatim template text.
  push(TPL.tail);

  return out.join('\n') + '\n';
}

// ═══ 4. MAIN ════════════════════════════════════════════════════════════════
if (!TPL || !TPL.headTop) fail('template blob missing — this build of gen-llms.mjs is broken');
const loaded = loadRegistry();
const rendered = render(loaded);

if (CHECK) {
  const current = readFileSync(join(ROOT, 'llms.txt'), 'utf8');
  if (rendered === current) {
    console.log('OK — llms.txt matches the suite-registry.json render (gen-llms.mjs --check)');
    process.exit(0);
  }
  const a = current.split('\n');
  const b = rendered.split('\n');
  console.error('FAIL — llms.txt is stale against suite-registry.json (file ' + a.length + ' lines, render ' + b.length + ' lines). First differences:');
  let shown = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && shown < 12; i++) {
    if (a[i] !== b[i]) {
      console.error('  L' + (i + 1) + ' file: ' + (a[i] === undefined ? '(none)' : a[i]));
      console.error('  L' + (i + 1) + ' gen : ' + (b[i] === undefined ? '(none)' : b[i]));
      shown++;
    }
  }
  console.error('Regenerate with: node scripts/gen-llms.mjs');
  process.exit(1);
}

writeFileSync(join(ROOT, 'llms.txt'), rendered, 'utf8');
console.log('gen-llms: wrote llms.txt (' + Buffer.byteLength(rendered, 'utf8') + ' bytes) from suite-registry.json v' + loaded.reg.version);
