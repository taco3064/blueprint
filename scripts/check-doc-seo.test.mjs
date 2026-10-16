import { describe, expect, it } from 'vitest';
import { pageUrl, seoProblems, SITE } from './check-doc-seo.mjs';

function page(file, paired = false) {
  const duplicate = file.startsWith('zh-TW/api/') || file === 'zh-TW/changelog.html';
  const url = pageUrl(duplicate ? file.slice(6) : file);
  const excluded = duplicate || file === '404.html';
  const other = file.startsWith('zh-TW/') ? file.slice(6) : `zh-TW/${file}`;
  const en = file.startsWith('zh-TW/') ? other : file;
  const zh = file.startsWith('zh-TW/') ? file : other;

  return `<html><head><title>${file}</title>
    <meta name="description" content="About ${file}">
    <link rel="canonical" href="${url}">
    ${excluded ? '<meta name="robots" content="noindex,follow">' : ''}
    <meta property="og:title" content="${file}">
    <meta property="og:description" content="About ${file}">
    <meta property="og:url" content="${url}">
    <meta property="og:type" content="website">
    <meta property="og:image" content="${SITE}logo.png">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:image" content="${SITE}logo.png">
    ${paired
      ? `<link rel="alternate" hreflang="en" href="${pageUrl(en)}">
    <link rel="alternate" hreflang="zh-TW" href="${pageUrl(zh)}">`
      : ''}
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'WebSite', url,
    })}</script></head><body>
    <a href="https://www.npmjs.com/package/@kekkai/blueprint">npm package</a>
    </body></html>`;
}

function fixture() {
  const files = ['index.html', 'zh-TW/index.html', 'guide.html', 'api/index.html',
    'zh-TW/api/index.html', 'changelog.html', 'zh-TW/changelog.html', '404.html'];

  return {
    pages: Object.fromEntries(files.map((file) => [file, page(file,
      ['index.html', 'zh-TW/index.html'].includes(file))])),
    assets: new Set(['logo.png']),
    sitemap: '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
      + files.filter((file) => !['404.html', 'zh-TW/api/index.html', 'zh-TW/changelog.html'].includes(file))
        .map((file) => `<url><loc>${pageUrl(file)}</loc></url>`).join('') + '</urlset>',
    robots: `User-agent: *\nAllow: /blueprint/\nSitemap: ${SITE}sitemap.xml\n`,
  };
}

describe('built documentation SEO proof', () => {
  it('accepts bilingual, unpaired, generated and deliberately excluded actual HTML', () => {
    expect(seoProblems(fixture())).toEqual([]);
  });

  it('reads greater-than signs and encoded quotes inside metadata attributes', () => {
    const site = fixture();

    site.pages['index.html'] = site.pages['index.html'].replaceAll('About index.html',
      'Node >=21.1.0 and &quot;quoted&quot; values &amp; symbols');

    expect(seoProblems(site)).toEqual([]);
  });

  it.each([
    ['wrong canonical', 'href="https://taco3064.github.io/blueprint/"', 'href="https://example.com/"'],
    ['broken language pair', 'hreflang="zh-TW"', 'hreflang="fr"'],
    ['wrong base path', `${SITE}logo.png`, 'https://taco3064.github.io/logo.png'],
    ['missing npm anchor', 'href="https://www.npmjs.com/package/@kekkai/blueprint"', 'data-click="npm"'],
    ['malformed JSON-LD', '"@context":', 'INVALID:'],
    ['indexable homepage blocked', '<title>', '<meta name="robots" content="noindex"><title>'],
    ['duplicate canonical', '<title>', `<link rel="canonical" href="${SITE}"><title>`],
  ])('rejects %s in rendered HTML', (_label, from, to) => {
    const site = fixture();

    site.pages['index.html'] = site.pages['index.html'].replace(from, to);
    expect(seoProblems(site).length).toBeGreaterThan(0);
  });

  it('rejects missing sitemap pages and foreign or nonexistent additions', () => {
    const site = fixture();

    site.sitemap = site.sitemap.replace(`<loc>${SITE}guide.html</loc>`,
      '<loc>https://www.npmjs.com/package/@kekkai/blueprint</loc>');

    expect(seoProblems(site)).toEqual([
      `Missing sitemap target: ${SITE}guide.html`,
      'Unexpected sitemap target: https://www.npmjs.com/package/@kekkai/blueprint',
    ]);
  });

  it('rejects copied API pages that become indexable', () => {
    const site = fixture();

    site.pages['zh-TW/api/index.html'] = site.pages['zh-TW/api/index.html']
      .replace('noindex,follow', 'index,follow');

    expect(seoProblems(site)).toContain('zh-TW/api/index.html: incorrect indexing policy');
  });

  it('rejects a missing original API page and nonexistent share image', () => {
    const site = fixture();

    delete site.pages['api/index.html'];
    site.assets.clear();
    const problems = seoProblems(site);

    expect(problems).toContain('zh-TW/api/index.html: missing original canonical target');
    expect(problems).toContain('index.html: og:image must resolve to a built site asset');
  });

  it('rejects blocking robots and empty artifacts', () => {
    const site = fixture();

    site.robots += 'Disallow: /blueprint/';
    expect(seoProblems(site)).toContain('Invalid robots policy');
    expect(seoProblems({ ...site, pages: {} })).toContain('No built HTML pages');
  });

  it('rejects a homepage description reused on a hand-authored page', () => {
    const site = fixture();

    site.pages['guide.html'] = site.pages['guide.html'].replaceAll('About guide.html', 'About index.html');
    expect(seoProblems(site)).toContain('guide.html: duplicate hand-authored description');
  });
});
