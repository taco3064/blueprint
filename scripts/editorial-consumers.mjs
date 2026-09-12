import fs from 'node:fs';
import path from 'node:path';

export function verifyConsumers(docsRoot) {
  const pages = markdownFiles(docsRoot)
    .filter((file) => !file.includes(`${path.sep}publication${path.sep}`));

  const routes = new Map();

  for (const file of pages) {
    const relative = path.relative(docsRoot, file);
    const localized = relative.startsWith(`zh-TW${path.sep}`);
    const route = localized ? relative.slice(`zh-TW${path.sep}`.length) : relative;
    const edition = localized ? 'zh-TW' : 'en';
    const pair = routes.get(route) ?? {};

    pair[edition] = managedReferences(fs.readFileSync(file, 'utf8'));
    routes.set(route, pair);
  }

  for (const [route, pair] of routes) {
    const english = pair.en ?? [];
    const traditionalChinese = pair['zh-TW'] ?? [];

    if (!english.length && !traditionalChinese.length) {
      continue;
    }

    if (!pair.en || !pair['zh-TW']) {
      throw new Error(`${route} has managed publication content but no paired locale page.`);
    }

    const localized = traditionalChinese.map(normalizeLocaleReference);
    const expected = english.map(normalizeLocaleReference);

    if (JSON.stringify(localized) !== JSON.stringify(expected)) {
      throw new Error(`${route} has different managed consumers between en and zh-TW.`);
    }
  }
}

function markdownFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);

    if (entry.isDirectory()) {
      return markdownFiles(target);
    }

    return entry.isFile() && entry.name.endsWith('.md') ? [target] : [];
  });
}

function managedReferences(markdown) {
  return markdown.split('\n')
    .filter((line) => line.includes('@/publication/'))
    .map((line) => line.trim());
}

function normalizeLocaleReference(reference) {
  return reference.replace(/\.(en|zh-TW)\.md/g, '.{locale}.md');
}
