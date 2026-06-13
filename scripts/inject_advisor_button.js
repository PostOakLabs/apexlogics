#!/usr/bin/env node
// inject_advisor_button.js — add "Open Advisor Composer" button to all 145 tool export rows.
//
// Strategy (additive-only — CONTRACT §7.2 / CG-25):
//   1. Find the .results-export-row in each tool HTML.
//   2. If an advisor button is already present, skip.
//   3. Insert button HTML after the AP2 export button (looks for 'ap2.json' in onclick).
//   4. Insert openAdvisorComposer() helper function near end of <script> block.
//   5. Patch the existing AP2 export function to save to sessionStorage as _ap2LastMandate
//      (so the Composer can auto-load when opened from a tool page).
//
// Run: cd repo && node scripts/inject_advisor_button.js [--dry-run]
// Dry-run: prints diffs, writes nothing.
// After: node scripts/check_tools.js  (gate must pass before commit)

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..');
const TOOLS_DIR = path.join(ROOT, 'tools');
const DRY_RUN   = process.argv.includes('--dry-run');
const COMPOSER_RELATIVE_PATH = '../../tools/ap2-advisor-prompt-composer/index.html';

// ── Patterns ──────────────────────────────────────────────────────────────────
// Skip the composer itself and any non-tool dirs
const SKIP_DIRS = new Set(['ap2-advisor-prompt-composer']);

// The button HTML we inject (must be unique; check before injecting)
const ADVISOR_BTN_SENTINEL = 'class="advisor-composer-btn"';

// Matches the AP2 export button line in the .results-export-row
// Looks for button that calls something ending in ap2.json download or exportAP2/downloadAP2
const AP2_BTN_PATTERN = /(<button[^>]*(?:exportAP2|downloadAP2|ap2ExportBtn|ap2\.json)[^>]*>[\s\S]*?<\/button>)/i;

// The button to inject after the AP2 button
const ADVISOR_BTN_HTML = `<button class="export-btn advisor-composer-btn" id="advisorComposerBtn" onclick="openAdvisorComposer()" title="Open AP2 Advisor Prompt Composer">🤝 Advisor Prompt</button>`;

// Helper function to inject into the tool's <script> block (before closing </script>)
// Uses sessionStorage so the Composer can auto-read it on load.
const ADVISOR_FUNCTION = `
// AL-153 Advisor Prompt Composer integration (CG-27)
function openAdvisorComposer() {
  // Try to read the last-generated AP2 mandate from sessionStorage
  var mandate = window._ap2LastMandate || null;
  var composerUrl = '${COMPOSER_RELATIVE_PATH}';
  if (mandate) {
    try {
      sessionStorage.setItem('_ap2LastMandate', typeof mandate === 'string' ? mandate : JSON.stringify(mandate));
    } catch(e) {}
  }
  window.open(composerUrl, '_blank', 'noopener');
}`;

// ── Session-storage patch: add window._ap2LastMandate = ... to AP2 export fn ──
// Looks for the pattern: URL.createObjectURL(new Blob([JSON.stringify(
// and prepends: window._ap2LastMandate = JSON.stringify(mandate);
// where `mandate` is whatever variable name is used just before the createObjectURL call.
//
// Safe heuristic: match the line that builds the blob JSON and insert BEFORE it.
// This is a comment-annotation injection — does not alter brace structure.
const BLOB_PATTERN = /(\n)([ \t]*)(const blob\s*=\s*URL\.createObjectURL\(new Blob\(\[JSON\.stringify\((\w+))/;

function injectBlobSave(html) {
  return html.replace(BLOB_PATTERN, (match, nl, indent, rest, varName) => {
    const save = `${nl}${indent}window._ap2LastMandate = JSON.stringify(${varName});\n`;
    return save + nl + indent + rest;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const dirs = fs.readdirSync(TOOLS_DIR).filter(d => {
    const full = path.join(TOOLS_DIR, d);
    return fs.statSync(full).isDirectory() && !SKIP_DIRS.has(d);
  });

  let modified = 0;
  let skipped  = 0;
  let noExportRow = 0;
  let alreadyInjected = 0;

  for (const dir of dirs) {
    const htmlPath = path.join(TOOLS_DIR, dir, 'index.html');
    if (!fs.existsSync(htmlPath)) { skipped++; continue; }

    let html = fs.readFileSync(htmlPath, 'utf8');

    // Already injected?
    if (html.includes(ADVISOR_BTN_SENTINEL)) {
      alreadyInjected++;
      continue;
    }

    // Must have .results-export-row
    if (!html.includes('results-export-row')) {
      console.log(`  skip (no export row): ${dir}`);
      noExportRow++;
      continue;
    }

    let changed = false;
    const orig  = html;

    // 1. Inject advisor button after AP2 button in results-export-row
    if (AP2_BTN_PATTERN.test(html)) {
      html = html.replace(AP2_BTN_PATTERN, `$1\n        ${ADVISOR_BTN_HTML}`);
      changed = true;
    } else {
      // Fallback: append before closing of results-export-row
      html = html.replace(
        /(<\/div>)([ \t]*<!-- ?(\/|end)?results-export|(?=[\s\S]{0,30}<\/div>))([\s\S]{0,5})(class="tool-footer"|class="mfst)/,
        `${ADVISOR_BTN_HTML}\n$1$2$4$5`
      );
      // Simpler fallback: insert before the closing </div> of results-export-row
      html = html.replace(
        /(class="results-export-row"[^>]*>[\s\S]*?)([ \t]*<\/div>)/,
        (m, inner, close) => {
          if (inner.includes(ADVISOR_BTN_SENTINEL)) return m;
          return inner + `\n        ${ADVISOR_BTN_HTML}\n` + close;
        }
      );
      changed = html !== orig;
    }

    // 2. Inject sessionStorage save before blob URL creation (AP2 export)
    if (BLOB_PATTERN.test(html)) {
      const patched = injectBlobSave(html);
      if (patched !== html) {
        html = patched;
        changed = true;
      }
    }

    // 3. Inject openAdvisorComposer() before last </script>
    if (changed && !html.includes('openAdvisorComposer')) {
      // Insert before the last </script> in the file
      const lastScript = html.lastIndexOf('</script>');
      if (lastScript !== -1) {
        html = html.slice(0, lastScript) + ADVISOR_FUNCTION + '\n' + html.slice(lastScript);
      }
    }

    if (!changed) {
      console.log(`  skip (no AP2 pattern found): ${dir}`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] would modify: ${dir}`);
    } else {
      fs.writeFileSync(htmlPath, html, 'utf8');
      console.log(`  ✓ injected: ${dir}`);
    }
    modified++;
  }

  console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}Results:`);
  console.log(`  Modified:         ${modified}`);
  console.log(`  Already injected: ${alreadyInjected}`);
  console.log(`  No export row:    ${noExportRow}`);
  console.log(`  Skipped/other:    ${skipped}`);
  console.log('\nNext: node scripts/check_tools.js (must print 0 before commit)');
}

main();
