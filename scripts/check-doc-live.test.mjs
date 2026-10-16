import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { liveProblems } from './check-doc-live.mjs';
import { SITE } from './check-doc-seo.mjs';

const roots = [];

afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

function artifact() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-live-'));

  roots.push(root);

  const html = `<html><head><title>Blueprint</title>
  <meta name="description" content="Architecture as code">
  <link rel="canonical" href="${SITE}">
  <meta property="og:title" content="Blueprint">
  <meta property="og:description" content="Architecture as code">
  <meta property="og:url" content="${SITE}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="${SITE}logo.png">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:image" content="${SITE}logo.png">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","url":"${SITE}"}</script>
  </head><body><a href="https://www.npmjs.com/package/@kekkai/blueprint">npm</a></body></html>`;

  const files = {
    'index.html': html,
    'logo.png': 'image bytes',
    'sitemap.xml': `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}</loc></url></urlset>`,
    'robots.txt': `User-agent: *\nAllow: /blueprint/\nSitemap: ${SITE}sitemap.xml`,
    'docs-provenance.json': '{"releaseTag":"v4.2.0","toolingSha":"candidate"}',
  };

  Object.entries(files).forEach(([file, text]) => fs.writeFileSync(path.join(root, file), text));

  const request = async (url) => {
    if (url === 'https://taco3064.github.io/robots.txt') return new Response('', { status: 404 });

    return new Response(files[url.slice(SITE.length) || 'index.html']);
  };

  return { root, request, files };
}

describe('live Pages artifact verification', () => {
  it('requires the exact deployed HTML, indexing resources, image and provenance', async () => {
    const { root, request } = artifact();

    expect(await liveProblems(root, { request })).toEqual([]);
  });

  it.each(['index.html', 'sitemap.xml', 'robots.txt', 'docs-provenance.json', 'logo.png'])(
    'rejects stale deployed %s', async (file) => {
      const { root, request, files } = artifact();

      files[file] += 'stale';
      const url = file === 'index.html' ? SITE : SITE + file;

      expect(await liveProblems(root, { request })).toEqual([
        `${url}: deployed bytes differ from the verified artifact`,
      ]);
    },
  );

  it('rejects an origin-level robots block', async () => {
    const { root, request } = artifact();

    expect(await liveProblems(root, { request: (url) => url.endsWith('github.io/robots.txt')
      ? new Response('User-agent: *\nDisallow: /')
      : request(url) })).toEqual([
      'Origin robots: origin robots has a potentially blocking rule; inspect owner policy',
    ]);
  });

  it('rejects missing remote pages', async () => {
    const { root, request } = artifact();

    expect(await liveProblems(root, { request: (url) => url === SITE
      ? new Response('', { status: 404 })
      : request(url) })).toEqual([`${SITE}: HTTP 404`]);
  });
});
