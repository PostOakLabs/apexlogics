#!/usr/bin/env node
// One-time (idempotent) SEO meta injector for AL-META-SEO.
// Adds missing <meta name="description">, <link rel="canonical">, OG tags, and twitter:card
// to every HTML page, sourcing description/canonical from suite-registry.json + sitemap.xml.
// Only ever ADDS a missing tag — never touches a tag that already exists.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DRY_RUN = process.argv.includes('--dry-run');

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p, out);
    } else if (entry.name.endsWith('.html')) {
      out.push(p);
    }
  }
  return out;
}

const allFiles = walk(ROOT, [])
  .map((p) => path.relative(ROOT, p).split(path.sep).join('/'))
  .filter((p) => p !== 'assets/logo_candidates.html');

// --- sitemap.xml -> canonical URL map -------------------------------------
const sitemapXml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const locs = [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
const canonicalMap = {};
function normalizeUrl(url) {
  return url.endsWith('/index.html') ? url.slice(0, -'index.html'.length) : url;
}

for (const url of locs) {
  let rel = url.replace('https://apexlogics.org/', '');
  if (rel === '') rel = 'index.html';
  else if (rel.endsWith('/')) rel = rel + 'index.html';
  canonicalMap[rel] = normalizeUrl(url);
}

// --- suite-registry.json -> description map -------------------------------
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'suite-registry.json'), 'utf8'));
const descMap = {};
for (const t of registry.tools) {
  if (t.file_path && t.description) descMap[t.file_path] = t.description;
}

// Hand-authored descriptions for the 6 workflow pages not present in the registry.
const MANUAL_DESC = {
  'workflows/2026-borrower-decision-journey.html':
    'Work through 2026 OBBBA student loan changes in order: RAP repayment plan, PSLF eligibility, Grad PLUS alternatives, and payoff strategy.',
  'workflows/course-design-studio.html':
    "Build a research-grounded course from scratch. Sequence objectives with Bloom's Taxonomy, design assessments, and choose a pedagogical framework.",
  'workflows/nurse-shift-travel-comp.html':
    'Compare staff, travel, and shift-differential nursing pay. Model tax-free stipends, overtime, gap weeks, and childcare costs to find your highest net income.',
  'workflows/skilled-trades-career-builder.html':
    'Project your wage arc from apprentice to business owner. Find the highest-ROI certifications and model when solo contracting income clears your paycheck.',
  'workflows/veteran-transition-gi-bill.html':
    'Plan your transition from ETS to first civilian paycheck. Maximize your GI Bill benefit, model SkillBridge ROI and credential transfers, and map income to close the gap.',
  'workflows/working-parent-childcare.html':
    'Plan the true cost of having a child, from parental leave income gap to childcare tax optimization. Stack benefits and minimize ongoing childcare costs.',
};

const OG_IMAGE = 'https://apexlogics.org/assets/og-default.png';

function escapeAttr(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const stats = { touched: 0, skipped: 0, byTag: { description: 0, canonical: 0, og: 0, twitter: 0 } };
const problems = [];

for (const rel of allFiles) {
  const abs = path.join(ROOT, rel);
  let html = fs.readFileSync(abs, 'utf8');

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!titleMatch) {
    problems.push(`${rel}: no <title> tag, skipped`);
    continue;
  }
  const titleText = titleMatch[1].trim();

  const hasDescription = /name=["']description["']/i.test(html);
  const hasCanonical = /rel=["']canonical["']/i.test(html);
  const hasOgType = /property=["']og:type["']/i.test(html);
  const hasOgSiteName = /property=["']og:site_name["']/i.test(html);
  const hasOgTitle = /property=["']og:title["']/i.test(html);
  const hasOgDescription = /property=["']og:description["']/i.test(html);
  const hasOgUrl = /property=["']og:url["']/i.test(html);
  const hasOgImage = /property=["']og:image["']/i.test(html);
  const hasTwitterCard = /name=["']twitter:card["']/i.test(html);

  const canonicalUrl = canonicalMap[rel];
  if (!canonicalUrl) {
    problems.push(`${rel}: no sitemap.xml entry, cannot derive canonical`);
    continue;
  }

  let description = null;
  if (!hasDescription || !hasOgDescription) {
    description = descMap[rel] || MANUAL_DESC[rel] || null;
    if (!description) {
      // Fall back to whatever is already in the page's own description tag, if any.
      const m = html.match(/name=["']description["']\s+content=["']([\s\S]*?)["']/i);
      description = m ? m[1] : null;
    }
    if (!description) {
      problems.push(`${rel}: missing description and no source found`);
    }
  }

  const lines = [];
  if (!hasDescription && description) {
    lines.push(`<meta name="description" content="${escapeAttr(description)}">`);
    stats.byTag.description++;
  }
  if (!hasCanonical) {
    lines.push(`<link rel="canonical" href="${canonicalUrl}">`);
    stats.byTag.canonical++;
  }
  if (!hasOgType) {
    lines.push(`<meta property="og:type" content="website">`);
    stats.byTag.og++;
  }
  if (!hasOgSiteName) {
    lines.push(`<meta property="og:site_name" content="ApexLogics">`);
    stats.byTag.og++;
  }
  if (!hasOgTitle) {
    lines.push(`<meta property="og:title" content="${escapeAttr(titleText)}">`);
    stats.byTag.og++;
  }
  if (!hasOgDescription && description) {
    lines.push(`<meta property="og:description" content="${escapeAttr(description)}">`);
    stats.byTag.og++;
  }
  if (!hasOgUrl) {
    lines.push(`<meta property="og:url" content="${canonicalUrl}">`);
    stats.byTag.og++;
  }
  if (!hasOgImage) {
    lines.push(`<meta property="og:image" content="${OG_IMAGE}">`);
    stats.byTag.og++;
  }
  if (!hasTwitterCard) {
    lines.push(`<meta name="twitter:card" content="summary">`);
    stats.byTag.twitter++;
  }

  if (lines.length === 0) {
    stats.skipped++;
    continue;
  }

  const insertion = '\n' + lines.join('\n');
  const idx = html.indexOf(titleMatch[0]) + titleMatch[0].length;
  html = html.slice(0, idx) + insertion + html.slice(idx);

  if (!DRY_RUN) fs.writeFileSync(abs, html, 'utf8');
  stats.touched++;
}

console.log(`Files scanned: ${allFiles.length}`);
console.log(`Files touched: ${stats.touched}`);
console.log(`Files already complete: ${stats.skipped}`);
console.log(`Tags added: description=${stats.byTag.description} canonical=${stats.byTag.canonical} og=${stats.byTag.og} twitter=${stats.byTag.twitter}`);
if (problems.length) {
  console.log(`\nProblems (${problems.length}):`);
  for (const p of problems) console.log(' - ' + p);
  process.exitCode = 1;
}
if (DRY_RUN) console.log('\n(dry run, no files written)');
