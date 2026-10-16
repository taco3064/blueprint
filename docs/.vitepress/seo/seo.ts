import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HeadConfig, PageData, UserConfig } from 'vitepress';

const origin = 'https://taco3064.github.io';
const base = '/blueprint/';
const site = `${origin}${base}`;
const npm = 'https://www.npmjs.com/package/@kekkai/blueprint';

export function pageUrl(path: string): string {
  return site + path.replace(/\.md$/, '.html').replace(/(^|\/)index\.html$/, '$1');
}

function plain(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '').replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
}

export function pageDescription(source: string, title: string, homeTagline?: string): string {
  if (homeTagline) return plain(homeTagline);
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/```[\s\S]*?```/g, '');
  const paragraph = body.split(/\r?\n\s*\r?\n/).find((part) => {
    const text = part.trim();
    return plain(text).length > 0 && !/^(?:#|>|\||-|\d+\.|<|Defined in:|\[)/.test(text);
  });
  const description = paragraph ? plain(paragraph) : `${title} — @kekkai/blueprint API reference.`;
  return description.length > 220 ? `${description.slice(0, 217).trimEnd()}…` : description;
}

export function seoHead(page: PageData, srcDir: string, renderedTitle?: string): HeadConfig[] {
  const path = page.relativePath;
  const duplicate = path.startsWith('zh-TW/api/') || path === 'zh-TW/changelog.md';
  const notFound = path === '404.md';
  const canonical = pageUrl(duplicate ? path.slice(6) : path);
  const zh = path.startsWith('zh-TW/');
  const home = path === 'index.md' || path === 'zh-TW/index.md';
  const title = renderedTitle ?? (page.title.includes('@kekkai/blueprint')
    ? page.title : `${page.title} | @kekkai/blueprint`);
  const description = page.description;
  const head: HeadConfig[] = [
    ['meta', { name: 'description', content: description }],
    ['link', { rel: 'canonical', href: canonical }],
    ['meta', { property: 'og:type', content: home ? 'website' : 'article' }],
    ['meta', { property: 'og:title', content: title }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:url', content: canonical }],
    ['meta', { property: 'og:image', content: `${site}logo.png` }],
    ['meta', { property: 'og:locale', content: zh && !duplicate ? 'zh_TW' : 'en_US' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:title', content: title }],
    ['meta', { name: 'twitter:description', content: description }],
    ['meta', { name: 'twitter:image', content: `${site}logo.png` }],
  ];
  if (duplicate || notFound) {
    head.push(['meta', { name: 'robots', content: 'noindex, follow' }]);
    return head;
  }
  const english = zh ? path.slice(6) : path;
  if (!english.startsWith('api/') && english !== 'changelog.md' && existsSync(resolve(srcDir, english))
    && existsSync(resolve(srcDir, `zh-TW/${english}`))) {
    head.push(
      ['link', { rel: 'alternate', hreflang: 'en', href: pageUrl(english) }],
      ['link', { rel: 'alternate', hreflang: 'zh-TW', href: pageUrl(`zh-TW/${english}`) }],
    );
  }
  head.push(['script', { type: 'application/ld+json' }, JSON.stringify({
    '@context': 'https://schema.org',
    '@type': home ? 'WebSite' : 'TechArticle',
    name: title,
    description,
    url: canonical,
    inLanguage: zh ? 'zh-TW' : 'en',
    ...(home ? { about: { '@type': 'SoftwareSourceCode', name: '@kekkai/blueprint',
      codeRepository: 'https://github.com/taco3064/blueprint', sameAs: npm } } : {}),
  }).replace(/</g, '\\u003c')]);
  return head;
}

export function withSeo(config: UserConfig): UserConfig {
  const verification = process.env.DOCS_GOOGLE_SITE_VERIFICATION;
  return {
    ...config,
    head: (config.head ?? []).filter(([tag, attrs]) =>
      !(tag === 'meta' && /^(og:|twitter:)/.test(attrs.property ?? attrs.name ?? '')))
      .concat(verification ? [['meta', { name: 'google-site-verification', content: verification }]] : []),
    sitemap: {
      hostname: site,
      transformItems: (items) => items.filter((item) =>
        !/(^|\/)zh-TW\/(?:api\/|changelog\.html$)/.test(item.url) && !/(^|\/)404\.html$/.test(item.url))
        .map((item) => ({ ...item, links: [] })),
    },
    async transformPageData(page, context) {
      Object.assign(page, await config.transformPageData?.(page, context));
      const sourcePath = resolve(context.siteConfig.srcDir, page.relativePath);
      const source = existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : '';
      if (page.frontmatter.layout === 'home') {
        page.title = `${page.frontmatter.hero.name} — ${page.frontmatter.hero.text}`;
        if (page.relativePath.startsWith('zh-TW/')) page.title += '（繁體中文）';
        page.frontmatter.title = page.title;
        page.titleTemplate = false;
        page.frontmatter.titleTemplate = false;
        page.frontmatter.hero.actions = [
          ...(page.frontmatter.hero.actions ?? []),
          { theme: 'alt', text: page.relativePath.startsWith('zh-TW/') ? '在 npm 查看套件' : 'View package on npm', link: npm },
        ];
      }
      page.description = pageDescription(source, page.title, page.frontmatter.hero?.tagline);
      if (page.relativePath === 'changelog.md') {
        page.description = 'Release history and changes for @kekkai/blueprint.';
      } else if (page.relativePath === 'zh-TW/changelog.md') {
        page.description = '@kekkai/blueprint 的版本紀錄與變更內容，以英文原文呈現。';
      }
      page.frontmatter.description = page.description;
    },
    async transformHead(context) {
      const inherited = await config.transformHead?.(context);
      return [...(inherited || []),
        ...seoHead(context.pageData, context.siteConfig.srcDir, context.title)];
    },
    async buildEnd(context) {
      await config.buildEnd?.(context);
      writeFileSync(resolve(context.outDir, 'robots.txt'),
        `User-agent: *\nAllow: ${base}\nSitemap: ${site}sitemap.xml\n`);
    },
  };
}
