import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://taco3064.github.io/blueprint/';
const NPM = 'https://www.npmjs.com/package/@kekkai/blueprint';

function decode(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': '\'', '&lt;': '<', '&gt;': '>' };
    if (named[entity]) return named[entity];

    return String.fromCodePoint(entity.startsWith('&#x')
      ? parseInt(entity.slice(3), 16)
      : parseInt(entity.slice(2), 10));
  });
}

function tags(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}\\b((?:"[^"]*"|'[^']*'|[^'">])*)>`, 'gi'))].map((match) =>
    Object.fromEntries([...match[1].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map((attr) => [attr[1].toLowerCase(), decode(attr[2] ?? attr[3])])));
}

export function pageUrl(file) {
  return SITE + file.replace(/(^|\/)index\.html$/, '$1');
}

export function readSite(root) {
  const pages = {};
  const assets = new Set();

  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll('\\', '/');
      if (entry.isDirectory()) visit(absolute);
      else if (relative.endsWith('.html')) {
        const html = fs.readFileSync(absolute, 'utf8');

        pages[relative] = ['index.html', 'zh-TW/index.html'].includes(relative)
          ? html
          : Buffer.from(/<head\b[^>]*>[\s\S]*?<\/head>/i.exec(html)?.[0] ?? '').toString();
      } else assets.add(relative);
    }
  };

  visit(root);

  const read = (name) => fs.existsSync(path.join(root, name))
    ? fs.readFileSync(path.join(root, name), 'utf8')
    : '';

  return { pages, assets, sitemap: read('sitemap.xml'), robots: read('robots.txt') };
}

export function seoProblems({ pages, assets, sitemap, robots }) {
  const problems = [];
  const records = new Map();
  const titles = new Set();
  const descriptions = new Set();

  const check = (condition, message) => {
    if (!condition) problems.push(message);
  };

  for (const [file, html] of Object.entries(pages)) {
    const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
    const links = tags(head, 'link');
    const metas = tags(head, 'meta');
    const meta = (key) => metas.filter((item) => item.name === key || item.property === key);

    const single = (key) => {
      const values = meta(key);

      check(values.length === 1 && !!values[0].content?.trim(), `${file}: one ${key} required`);

      return values[0]?.content;
    };

    const duplicate = file.startsWith('zh-TW/api/') || file === 'zh-TW/changelog.html';
    const excluded = duplicate || file === '404.html';
    const url = pageUrl(file);
    const canonical = links.filter((link) => link.rel === 'canonical');
    const expected = duplicate ? pageUrl(file.slice(6)) : url;

    check(canonical.length === 1 && canonical[0].href === expected,
      `${file}: wrong canonical; expected ${expected}`);

    const noindex = meta('robots').some((item) => /\bnoindex\b/i.test(item.content));

    check(noindex === excluded, `${file}: incorrect indexing policy`);
    const alternates = links.filter((link) => link.rel === 'alternate' && link.hreflang);

    records.set(url, { file, canonical: canonical[0]?.href, excluded, alternates });
    if (file === '404.html') continue;
    const title = [...head.matchAll(/<title>([\s\S]*?)<\/title>/gi)];
    const titleText = decode(title[0]?.[1] ?? '');

    check(title.length === 1 && !!titleText.trim(), `${file}: one nonempty title required`);
    const description = single('description');

    check(single('og:title') === titleText, `${file}: og:title disagrees with title`);
    check(single('og:description') === description, `${file}: og:description disagrees`);
    check(single('og:url') === expected, `${file}: og:url disagrees with canonical`);
    single('og:type');

    check(['summary', 'summary_large_image'].includes(single('twitter:card')),
      `${file}: invalid Twitter card`);

    for (const key of ['og:image', 'twitter:image']) {
      const image = single(key);

      check(image?.startsWith(SITE) && assets.has(image.slice(SITE.length)),
        `${file}: ${key} must resolve to a built site asset`);
    }

    if (!file.includes('api/')) {
      check(!titles.has(titleText), `${file}: duplicate hand-authored title`);
      check(!descriptions.has(description), `${file}: duplicate hand-authored description`);
      titles.add(titleText);
      descriptions.add(description);
    }

    for (const match of head.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const data = JSON.parse(match[1]);

        check(data['@context'] === 'https://schema.org' && !!data['@type']
          && data.url === expected, `${file}: unsupported JSON-LD identity`);
      } catch {
        problems.push(`${file}: invalid JSON-LD`);
      }
    }

    if (['index.html', 'zh-TW/index.html'].includes(file)) {
      check(/application\/ld\+json/.test(head), `${file}: missing home JSON-LD`);
      const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? '';

      check(tags(body, 'a').some((anchor) => anchor.href === NPM),
        `${file}: missing crawlable npm link`);
    }
  }

  check(records.size > 0, 'No built HTML pages');

  for (const [url, record] of records) {
    const { file, excluded, alternates } = record;
    const counterpart = file.startsWith('zh-TW/') ? file.slice(6) : `zh-TW/${file}`;

    const paired = !excluded && !file.includes('api/') && file !== 'changelog.html'
      && pages[counterpart] !== undefined;

    const expected = paired
      ? new Map([
          ['en', pageUrl(file.startsWith('zh-TW/') ? counterpart : file)],
          ['zh-TW', pageUrl(file.startsWith('zh-TW/') ? file : counterpart)],
        ])
      : new Map();

    check(alternates.length === expected.size, `${file}: incorrect language pairing count`);

    for (const [lang, target] of expected) {
      const matches = alternates.filter((item) => item.hreflang === lang && item.href === target);

      check(matches.length === 1,
        `${file}: missing or wrong ${lang} alternative`);
    }

    for (const alternate of alternates) {
      const target = records.get(alternate.href);

      check(target && !target.excluded && target.alternates.some((item) => item.href === url),
        `${file}: nonreciprocal or nonindexable language alternative`);
    }

    if (file.startsWith('zh-TW/api/') || file === 'zh-TW/changelog.html') {
      check(records.has(record.canonical), `${file}: missing original canonical target`);
    }
  }

  check(/<urlset\b[^>]*xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/.test(sitemap)
    && /<\/urlset>\s*$/.test(sitemap), 'Invalid sitemap document');

  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]));

  check(locations.length === new Set(locations).size, 'Duplicate sitemap locations');
  const expectedUrls = [...records].filter(([, record]) => !record.excluded).map(([url]) => url);
  for (const url of expectedUrls) check(locations.includes(url), `Missing sitemap target: ${url}`);
  for (const url of locations) check(expectedUrls.includes(url), `Unexpected sitemap target: ${url}`);

  check(/^User-agent:\s*\*\s*$/im.test(robots)
    && !/^Disallow:\s*\S+/im.test(robots)
    && robots.includes(`Sitemap: ${SITE}sitemap.xml`), 'Invalid robots policy');

  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = seoProblems(readSite(process.argv[2] ?? 'docs/.vitepress/dist'));
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else console.log('Built documentation SEO verified.');
}
