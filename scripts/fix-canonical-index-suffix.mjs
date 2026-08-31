#!/usr/bin/env node
// Follow-up fix for apply-seo-meta.mjs: sitemap.xml had 89 URLs ending in a literal
// "/index.html" instead of the directory-slash form used by the other 262+ URLs.
// The injector faithfully copied that inconsistency into canonical/og:url tags.
// This script normalizes both sitemap.xml and every already-written tag to the
// directory-slash form, so canonical is uniform across the whole suite.

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
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

// 1. Normalize sitemap.xml itself.
const sitemapPath = path.join(ROOT, 'sitemap.xml');
let sitemapXml = fs.readFileSync(sitemapPath, 'utf8');
const before = (sitemapXml.match(/index\.html<\/loc>/g) || []).length;
sitemapXml = sitemapXml.replace(/\/index\.html<\/loc>/g, '/</loc>');
const after = (sitemapXml.match(/index\.html<\/loc>/g) || []).length;
console.log(`sitemap.xml: normalized ${before - after} URLs (${after} remaining, expected 0)`);
if (!DRY_RUN) fs.writeFileSync(sitemapPath, sitemapXml, 'utf8');

// 2. Fix every HTML page's canonical/og:url tags that carry the old form.
const files = walk(ROOT, []).map((p) => path.relative(ROOT, p).split(path.sep).join('/'));
let filesFixed = 0;
let tagsFixed = 0;
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  let html = fs.readFileSync(abs, 'utf8');
  const re = /(href|content)="(https:\/\/apexlogics\.org\/[^"]*)\/index\.html"/g;
  let count = 0;
  html = html.replace(re, (m, attr, urlBase) => {
    count++;
    return `${attr}="${urlBase}/"`;
  });
  if (count > 0) {
    tagsFixed += count;
    filesFixed++;
    if (!DRY_RUN) fs.writeFileSync(abs, html, 'utf8');
  }
}
console.log(`HTML pages: fixed ${tagsFixed} tags across ${filesFixed} files`);
if (DRY_RUN) console.log('(dry run, no files written)');
