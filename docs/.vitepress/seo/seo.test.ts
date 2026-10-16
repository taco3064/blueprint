import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from 'vitepress';
import { pageDescription, pageUrl, seoHead, withSeo } from './seo';

const temporary: string[] = [];
function fixture() {
  const path = mkdtempSync(join(tmpdir(), 'blueprint-seo-'));
  temporary.push(path);
  mkdirSync(join(path, 'zh-TW'));
  writeFileSync(join(path, 'index.md'), '# Home');
  writeFileSync(join(path, 'zh-TW/index.md'), '# 首頁');
  return path;
}
function page(relativePath: string): PageData {
  return { relativePath, title: 'Example', description: 'Page-specific description',
    frontmatter: {}, headers: [], filePath: relativePath };
}
afterEach(() => {
  temporary.splice(0).forEach((path) => rmSync(path, { recursive: true }));
  vi.unstubAllEnvs();
});

describe('released documentation SEO', () => {
  it.each([
    ['index.md', ''], ['zh-TW/index.md', 'zh-TW/'],
    ['commands.md', 'commands.html'], ['philosophy/index.md', 'philosophy/'],
    ['api/functions/run.md', 'api/functions/run.html'],
  ])('maps %s to the actual static route', (source, expected) => {
    expect(pageUrl(source)).toBe(`https://taco3064.github.io/blueprint/${expected}`);
  });

  it('derives descriptions from source prose, skipping frontmatter, fences and reference scaffolding', () => {
    expect(pageDescription('---\ntitle: ignored\n---\n# Header\n\n```js\nignore();\n```\n\nDefined in: a very long source reference line\n\nAuthor a **Blueprint** using [configuration](./config).\n\nNext paragraph.', 'Header'))
      .toBe('Author a Blueprint using configuration.');
    expect(pageDescription('# Only a heading', 'Function: run')).toBe('Function: run — @kekkai/blueprint API reference.');
    expect(pageDescription('body', 'Home', 'A **released** tagline')).toBe('A released tagline');
    expect(pageDescription('a'.repeat(220), 'Title')).toBe('a'.repeat(220));
    expect(pageDescription('a'.repeat(221), 'Title')).toBe(`${'a'.repeat(217)}…`);
    expect(pageDescription('# 設定\n\n一份架構定義。\n\n後續細節。', '設定')).toBe('一份架構定義。');
    expect(pageDescription('  \n\n`_`\n\nShort introduction.', 'Title')).toBe('Short introduction.');
  });

  it('emits reciprocal alternates only when both real non-API sources exist', () => {
    const dir = fixture();
    writeFileSync(join(dir, 'changelog.md'), '<!--@include: ../CHANGELOG.md-->');
    writeFileSync(join(dir, 'zh-TW/changelog.md'), '# 版本紀錄');
    const alternates = (path: string) => seoHead(page(path), dir).filter(([, attrs]) => attrs.rel === 'alternate');
    const expected = [
      ['link', { rel: 'alternate', hreflang: 'en', href: pageUrl('index.md') }],
      ['link', { rel: 'alternate', hreflang: 'zh-TW', href: pageUrl('zh-TW/index.md') }],
    ];
    expect(alternates('index.md')).toEqual(expected);
    expect(alternates('zh-TW/index.md')).toEqual(expected);
    expect(alternates('commands.md')).toEqual([]);
    expect(alternates('zh-TW/commands.md')).toEqual([]);
    expect(alternates('api/index.md')).toEqual([]);
    expect(alternates('changelog.md')).toEqual([]);
    expect(alternates('zh-TW/changelog.md')).toEqual([]);
  });

  it.each(['zh-TW/api/index.md', 'zh-TW/api/functions/run.md', 'zh-TW/changelog.md', '404.md'])('excludes %s without language or schema claims', (path) => {
    const head = seoHead(page(path), fixture());
    expect(head).toContainEqual(['meta', { name: 'robots', content: 'noindex, follow' }]);
    expect(head).toContainEqual(['link', { rel: 'canonical', href: pageUrl(path.replace(/^zh-TW\//, '')) }]);
    expect(head.filter(([, attrs]) => attrs.rel === 'alternate' || attrs.type === 'application/ld+json')).toEqual([]);
  });

  it('describes included release history accurately and indexes only its English source', async () => {
    const dir = fixture();
    const config = withSeo({});
    for (const [path, description] of [
      ['changelog.md', 'Release history and changes for @kekkai/blueprint.'],
      ['zh-TW/changelog.md', '@kekkai/blueprint 的版本紀錄與變更內容，以英文原文呈現。'],
    ]) {
      writeFileSync(join(dir, path), '<!--@include: ../CHANGELOG.md-->');
      const data = page(path);
      await config.transformPageData!(data, { siteConfig: { srcDir: dir } } as never);
      expect(data.description).toBe(description);
      expect(data.frontmatter.description).toBe(description);
    }
    const englishHead = seoHead(page('changelog.md'), dir);
    expect(englishHead.filter(([, attrs]) => attrs.name === 'robots' || attrs.rel === 'alternate')).toEqual([]);
    expect(englishHead).toContainEqual(['link', { rel: 'canonical', href: pageUrl('changelog.md') }]);
    expect(await config.sitemap!.transformItems!([
      { url: 'changelog.html' }, { url: 'zh-TW/changelog.html' }, { url: 'zh-TW/changelog-notes.html' },
    ])).toEqual([{ url: 'changelog.html', links: [] }, { url: 'zh-TW/changelog-notes.html', links: [] }]);
  });

  it('uses page metadata, self canonical URLs, localized schema and social images', () => {
    const head = seoHead(page('zh-TW/index.md'), fixture());
    expect(head).toContainEqual(['meta', { property: 'og:title', content: 'Example | @kekkai/blueprint' }]);
    expect(head).toContainEqual(['meta', { property: 'og:description', content: 'Page-specific description' }]);
    expect(head).toContainEqual(['meta', { property: 'og:url', content: pageUrl('zh-TW/index.md') }]);
    expect(head).toContainEqual(['meta', { property: 'og:locale', content: 'zh_TW' }]);
    expect(head).toContainEqual(['meta', { name: 'twitter:image', content: `${pageUrl('index.md')}logo.png` }]);
    const json = JSON.parse(head.find(([tag]) => tag === 'script')![2]!);
    expect(json).toMatchObject({ '@type': 'WebSite', url: pageUrl('zh-TW/index.md'), inLanguage: 'zh-TW',
      about: { sameAs: 'https://www.npmjs.com/package/@kekkai/blueprint' } });
    const article = seoHead({ ...page('commands.md'), title: '<unsafe> @kekkai/blueprint' }, fixture());
    expect(article.find(([tag]) => tag === 'script')![2]).not.toContain('<unsafe>');
    expect(JSON.parse(article.find(([tag]) => tag === 'script')![2]!)).toMatchObject({ '@type': 'TechArticle', inLanguage: 'en' });
  });

  it('routes quoted descriptions through the escaped head renderer without pre-encoding content', async () => {
    const data = { ...page('api/functions/renderArchitectureReport.md'), description: '"Layer > Unit" & "Module > Layer > Unit"' };
    const dir = fixture();
    const head = seoHead(data, dir);
    expect(head).toContainEqual(['meta', { name: 'description', content: '"Layer > Unit" & "Module > Layer > Unit"' }]);
    expect(head).toContainEqual(['meta', { property: 'og:description', content: data.description }]);
    expect(head).toContainEqual(['meta', { name: 'twitter:description', content: data.description }]);
    expect(await withSeo({}).transformHead!({ pageData: data, title: data.title, siteConfig: { srcDir: dir } } as never))
      .toContainEqual(['meta', { name: 'description', content: data.description }]);
    expect(data.description).toBe('"Layer > Unit" & "Module > Layer > Unit"');
  });

  it('filters sitemap duplicates, preserves other config, writes robots and adds only home npm links', async () => {
    vi.stubEnv('DOCS_GOOGLE_SITE_VERIFICATION', '');
    const dir = fixture();
    const config = withSeo({ title: 'Released', head: [
      ['link', { rel: 'icon', href: '/blueprint/favicon.png' }],
      ['meta', { property: 'og:title', content: 'Old static title' }],
      ['meta', { name: 'twitter:card', content: 'summary' }],
    ] });
    expect(config.title).toBe('Released');
    expect(config.head).toEqual([['link', { rel: 'icon', href: '/blueprint/favicon.png' }]]);
    const items = ['index.html', 'zh-TW/index.html', 'api/index.html', 'zh-TW/api/index.html', '404.html'].map((url) => ({ url }));
    expect(await config.sitemap!.transformItems!(items)).toEqual(items.slice(0, 3).map((item) => ({ ...item, links: [] })));
    await config.buildEnd!({ outDir: dir } as never);
    expect(readFileSync(join(dir, 'robots.txt'), 'utf8')).toBe('User-agent: *\nAllow: /blueprint/\nSitemap: https://taco3064.github.io/blueprint/sitemap.xml\n');
    for (const path of ['index.md', 'zh-TW/index.md']) {
      const home = page(path);
      home.frontmatter = { layout: 'home', hero: { name: '@kekkai/blueprint', text: 'Architecture as Code',
        tagline: 'Released tagline', actions: [{ theme: 'brand', text: 'Adopt', link: '#adopt' }] } };
      await config.transformPageData!(home, { siteConfig: { srcDir: dir } } as never);
      expect(home.frontmatter.hero.actions).toEqual([
        { theme: 'brand', text: 'Adopt', link: '#adopt' },
        { theme: 'alt', text: path.startsWith('zh-TW/') ? '在 npm 查看套件' : 'View package on npm', link: 'https://www.npmjs.com/package/@kekkai/blueprint' },
      ]);
      expect(home.description).toBe('Released tagline');
      expect(home.title).toBe(`@kekkai/blueprint — Architecture as Code${path.startsWith('zh-TW/') ? '（繁體中文）' : ''}`);
    }
    const other = page('commands.md');
    await config.transformPageData!(other, { siteConfig: { srcDir: dir } } as never);
    expect(other.frontmatter.hero).toBeUndefined();
  });

  it('preserves release hooks, exposes optional verification and sanitizes sitemap locale claims', async () => {
    vi.stubEnv('DOCS_GOOGLE_SITE_VERIFICATION', 'public-token');
    const dir = fixture();
    const buildEnd = vi.fn();
    const config = withSeo({ buildEnd,
      transformPageData: () => ({ title: 'Released override' }),
      transformHead: () => [['meta', { name: 'released', content: 'retained' }]],
    });
    expect(config.head).toEqual([['meta', { name: 'google-site-verification', content: 'public-token' }]]);
    const ordinary = page('index.md');
    await config.transformPageData!(ordinary, { siteConfig: { srcDir: dir } } as never);
    expect(ordinary.title).toBe('Released override');
    const head = await config.transformHead!({ pageData: ordinary, title: 'Rendered title', siteConfig: { srcDir: dir } } as never);
    expect(head).toContainEqual(['meta', { name: 'released', content: 'retained' }]);
    expect(head).toContainEqual(['meta', { property: 'og:title', content: 'Rendered title' }]);
    const context = { outDir: dir };
    await config.buildEnd!(context as never);
    expect(buildEnd).toHaveBeenCalledExactlyOnceWith(context);
    expect(config.sitemap!.hostname).toBe('https://taco3064.github.io/blueprint/');
    const links = [{ lang: 'en-US', url: '' }, { lang: 'zh-TW', url: 'zh-TW/' }];
    expect(await config.sitemap!.transformItems!([
      { url: '', links }, { url: 'api/', links }, { url: 'zh-TW/api/', links }, { url: '404.html' },
    ])).toEqual([
      { url: '', links: [] },
      { url: 'api/', links: [] },
    ]);
    const home = page('index.md');
    home.frontmatter = { layout: 'home', hero: { name: 'Blueprint', text: 'Architecture' } };
    await withSeo({}).transformPageData!(home, { siteConfig: { srcDir: dir } } as never);
    expect(home.frontmatter.hero.actions).toHaveLength(1);
    expect(home.titleTemplate).toBe(false);
    expect(await withSeo({}).transformHead!({ pageData: page('404.md'), title: '404', siteConfig: { srcDir: dir } } as never))
      .toContainEqual(['meta', { name: 'robots', content: 'noindex, follow' }]);
  });
});
