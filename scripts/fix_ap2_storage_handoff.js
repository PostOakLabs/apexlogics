#!/usr/bin/env node
// fix_ap2_storage_handoff.js — one-shot: replace sessionStorage-based mandate handoff
// in chaingraph/*.html with the CONTRACT §6.3/§6.4 ?ap2= URL-param pattern.
// Additive-only where possible; the 3-statement inline block is a straight swap
// for a single openAdvisor(mandate) call, plus one shared helper injected per file.
// Run: node scripts/fix_ap2_storage_handoff.js [--dry-run]

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'chaingraph');
const DRY_RUN = process.argv.includes('--dry-run');

const CALL_PATTERN = /sessionStorage\.setItem\('_ap2LastMandate',JSON\.stringify\(([^()]+)\)\);\s*window\._ap2LastMandate=JSON\.stringify\(\1\);\s*window\.open\('\.\.\/tools\/advisor-prompt-composer\/','_blank'\);/g;

const HELPER = `
// AP2 mandate handoff — CONTRACT CG-10/§6.3-6.4 (?ap2= URL param, no sessionStorage — CG-26)
function openAdvisor(mandate){
  const json=JSON.stringify(mandate);
  const encoded=encodeURIComponent(json);
  if(encoded.length<2000){
    window.open('../tools/advisor-prompt-composer/?ap2='+encoded,'_blank','noopener');
  } else {
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    a.download='mandate-'+Date.now()+'.json';
    a.click();
    alert('This artifact is large — downloaded as JSON. Paste its contents into the Advisor Composer’s paste box.');
    window.open('../tools/advisor-prompt-composer/','_blank','noopener');
  }
}
`;

const REFERRER_META = '<meta name="referrer" content="no-referrer">';

let filesChanged = 0, callsitesReplaced = 0;

for (const file of fs.readdirSync(DIR)) {
  if (!file.endsWith('.html') || file === 'chaingraph-hub.html') continue;
  const p = path.join(DIR, file);
  let html = fs.readFileSync(p, 'utf8');
  const orig = html;

  const matches = html.match(CALL_PATTERN) || [];
  if (!matches.length) { console.log(`  skip (no handoff pattern): ${file}`); continue; }

  html = html.replace(CALL_PATTERN, (m, varName) => `openAdvisor(${varName});`);
  callsitesReplaced += matches.length;

  if (!html.includes('function openAdvisor(')) {
    const lastScript = html.lastIndexOf('</script>');
    html = html.slice(0, lastScript) + HELPER + html.slice(lastScript);
  }

  if (!html.includes('name="referrer"')) {
    html = html.replace(/<meta name="viewport"[^>]*>/, (m) => `${m}\n${REFERRER_META}`);
  }

  if (html !== orig) {
    filesChanged++;
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] would modify: ${file} (${matches.length} callsite(s))`);
    } else {
      fs.writeFileSync(p, html, 'utf8');
      console.log(`  fixed: ${file} (${matches.length} callsite(s))`);
    }
  }
}

console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}Files changed: ${filesChanged}, callsites replaced: ${callsitesReplaced}`);
