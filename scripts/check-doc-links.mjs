// Verifies every internal link in the built docs site: the target page must
// exist, and when the href carries a fragment, a heading with that exact id
// must exist on the target page. Hand-written anchors (em-dash heading ids)
// break silently when a heading is reworded — this is the gate that catches
// it. Run after `docs:build`; exits 1 on the first broken batch.
import fs from 'node:fs';
import path from 'node:path';

const DIST = 'docs/.vitepress/dist';
const BASE = '/blueprint/';

/** Every built page except the generated API reference (typedoc owns those). */
function pages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) return entry.name === 'api' ? [] : pages(full);

    return entry.name.endsWith('.html') ? [full] : [];
  });
}

/** `guide/deps.html#fragment` → the dist file that must serve it. */
function fileFor(target) {
  if (target === '' || target.endsWith('/')) return path.join(target, 'index.html');

  return target.endsWith('.html') ? target : `${target}.html`;
}

const broken = [];
let checked = 0;

for (const page of pages(DIST)) {
  const html = fs.readFileSync(page, 'utf-8');

  for (const [, href] of html.matchAll(/href="(\/blueprint\/[^"]+)"/g)) {
    const raw = decodeURIComponent(href).slice(BASE.length);
    const last = raw.split('#')[0].split('/').pop() ?? '';

    // Static assets (css/js/png/ico…) are hash-managed by vite — skip them.
    if (last.includes('.') && !last.endsWith('.html')) continue;

    const [target, fragment] = raw.split('#');
    const file = path.join(DIST, fileFor(target));

    checked += 1;

    if (!fs.existsSync(file)) {
      broken.push(`${page} → ${href} (missing page)`);
    } else if (fragment && !fs.readFileSync(file, 'utf-8').includes(`id="${fragment}"`)) {
      broken.push(`${page} → ${href} (missing anchor)`);
    }
  }
}

if (broken.length) {
  console.error(`✗ ${broken.length} broken internal link(s):`);
  for (const line of broken) console.error(`  ${line}`);
  process.exit(1);
}

console.log(`✓ ${checked} internal links verified across the built site.`);
