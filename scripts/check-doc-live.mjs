import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageUrl, readSite, seoProblems, SITE } from './check-doc-seo.mjs';

const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export async function liveProblems(root, { request = fetch } = {}) {
  const site = readSite(root);
  const problems = seoProblems(site);
  if (problems.length) return problems;
  const files = [...Object.keys(site.pages), 'sitemap.xml', 'robots.txt', 'docs-provenance.json'];

  for (const html of Object.values(site.pages)) {
    for (const match of html.matchAll(/content="(https:\/\/taco3064.github.io\/blueprint\/[^"<>]+\.(?:png|jpg|svg|webp))"/g)) {
      files.push(match[1].slice(SITE.length));
    }
  }

  const pending = [...new Set(files)];

  await Promise.all(Array.from({ length: 8 }, async () => {
    while (pending.length) {
      const file = pending.shift();
      const url = file.endsWith('.html') ? pageUrl(file) : SITE + file;

      try {
        const response = await request(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
        const expectedStatus = file === '404.html' ? [200, 404] : [200];
        if (!expectedStatus.includes(response.status)) throw new Error(`HTTP ${response.status}`);
        const body = Buffer.from(await response.arrayBuffer());

        if (digest(body) !== digest(fs.readFileSync(path.join(root, file)))) {
          throw new Error('deployed bytes differ from the verified artifact');
        }
      } catch (error) {
        problems.push(`${url}: ${error.message}`);
      }
    }
  }));

  try {
    const rootRobots = await request('https://taco3064.github.io/robots.txt', {
      signal: AbortSignal.timeout(15000), cache: 'no-store',
    });

    if (rootRobots.status !== 404) {
      if (rootRobots.status !== 200) throw new Error(`HTTP ${rootRobots.status}`);
      const text = await rootRobots.text();
      const disallows = [...text.matchAll(/^Disallow:\s*(\S+)/gim)].map((match) => match[1]);

      if (disallows.some((rule) => '/blueprint/'.startsWith(rule) || rule.includes('*')
        || rule.startsWith('/blueprint/'))) {
        throw new Error('origin robots has a potentially blocking rule; inspect owner policy');
      }
    }
  } catch (error) {
    problems.push(`Origin robots: ${error.message}`);
  }

  return problems.sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root) throw new Error('Pass the verified Pages artifact directory');
  let problems;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    problems = await liveProblems(root);
    if (!problems.length) break;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else console.log('Live Pages bytes match the verified SEO artifact; indexing is not asserted.');
}
