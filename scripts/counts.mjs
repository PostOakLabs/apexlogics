/**
 * scripts/counts.mjs — single source of truth for suite-wide counts.
 *
 * Derived from what's actually on disk / in the registry, never hand-maintained.
 * Consumed by scripts/verify-counts.mjs (CI gate) — see that file for the
 * sentinel formats it checks.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function countHtmlFiles(dir, excludeIndex = true) {
  const full = join(ROOT, dir);
  return readdirSync(full)
    .filter(f => f.endsWith('.html'))
    .filter(f => !excludeIndex || f !== 'index.html')
    .length;
}

export function deriveCounts() {
  const raw = readFileSync(join(ROOT, 'suite-registry.json'), 'utf8').replace(/\x00+$/, '');
  const registry = JSON.parse(raw);

  const tools = registry.tools.filter(t => t.category !== 'showcase').length;
  const showcase = registry.tools.filter(t => t.category === 'showcase').length;
  const workflows = countHtmlFiles('workflows');
  const guides = countHtmlFiles('guides');

  return { tools, showcase, workflows, guides };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(deriveCounts(), null, 2));
}
