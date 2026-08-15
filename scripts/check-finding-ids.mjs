// Verifies that the finding list on the checks reference names exactly the ids
// `inspect` can construct — in both locales. `check-doc-links.mjs` proves a link
// resolves; nothing proved a LIST was complete, and the list had drifted to 11 of
// 20 one id at a time, each addition landing in a ticket that only knew about its
// own. A set that must match a set in the source is the same class as a diagram
// that must match a preset, and this is the half of that class a program can hold.
// Runs on the sources, not the built site, so it needs no `docs:build`.
import fs from 'node:fs';

/** Where the ids are constructed, and the section that must list them. */
export const SOURCE = 'src/inspect/analyze.ts';
export const PAGES = [
  { file: 'docs/guide/reference.md', heading: '## What `inspect` reports' },
  { file: 'docs/zh-TW/guide/reference.md', heading: '## `inspect` 回報的檢測項目' },
];

/**
 * Every finding id built in `source`, from the three shapes that build one: the
 * `finding()` helper, a bare object literal, and the ternary a rule that answers
 * under two names is written as (`modular ? 'missing-module' : 'missing-layer'`).
 *
 * A regex over source text is the same reading `inspect`'s own scanner does and
 * fails the same way — a computed id would be invisible. Every site is a literal
 * today, and a new one that is not would have to be written deliberately.
 */
export function constructedIds(source) {
  const ids = new Set();

  for (const [, id] of source.matchAll(/\bfinding\(\s*'(?:error|warn|info)',\s*'([a-z-]+)'/g)) {
    ids.add(id);
  }

  for (const [, id] of source.matchAll(/\brule:\s*'([a-z-]+)'/g)) ids.add(id);

  const ternary = /\brule:\s*[A-Za-z_$][\w$]*\s*\?\s*'([a-z-]+)'\s*:\s*'([a-z-]+)'/g;

  for (const [, whenTrue, whenFalse] of source.matchAll(ternary)) {
    ids.add(whenTrue);
    ids.add(whenFalse);
  }

  return ids;
}

/**
 * The ids a page's finding section lists, read from the bullet's leading bold
 * code span so that an id merely MENTIONED in another entry's prose does not
 * count as documented. `null` when the heading is absent — a renamed heading is
 * a silent pass otherwise, which is the failure this whole script exists to stop.
 */
export function documentedIds(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);

  if (start < 0) return null;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const section = (end < 0 ? rest : rest.slice(0, end)).join('\n');

  return new Set([...section.matchAll(/^- \*\*`([a-z-]+)`\*\*/gm)].map(([, id]) => id));
}

/** Sorted ids in `left` and not in `right`. */
function missingFrom(left, right) {
  return [...left].filter((id) => !right.has(id)).sort();
}

/**
 * One page's verdict against the constructed set: what it never lists, and what
 * it lists that nothing can produce. `relative-escape` sat in the second column
 * for two releases after #196 split it, so both directions are failures.
 */
export function comparePage(constructed, page) {
  if (page.documented === null) {
    return [`${page.file}: heading not found — ${page.heading}`];
  }

  const undocumented = missingFrom(constructed, page.documented);
  const unproducible = missingFrom(page.documented, constructed);

  return [
    ...(undocumented.length
      ? [`${page.file}: ${undocumented.length} id(s) inspect can produce and the page never lists — ${undocumented.join(', ')}`]
      : []),
    ...(unproducible.length
      ? [`${page.file}: ${unproducible.length} id(s) listed that no code path produces — ${unproducible.join(', ')}`]
      : []),
  ];
}

/** Every page's verdict, flattened. */
export function compare(constructed, pages) {
  return pages.flatMap((page) => comparePage(constructed, page));
}

/* v8 ignore start -- the I/O shell; the decisions above are what the tests drive */
export function main(read = (file) => fs.readFileSync(file, 'utf-8')) {
  const constructed = constructedIds(read(SOURCE));
  const pages = PAGES.map((page) => ({
    ...page,
    documented: documentedIds(read(page.file), page.heading),
  }));
  const problems = compare(constructed, pages);

  if (problems.length) {
    console.error(`✗ finding ids out of sync with ${SOURCE}:\n`);

    for (const problem of problems) console.error(`  ${problem}`);

    console.error(
      '\n  Fix the page, not this check: every id above is one an adopter meets in a'
      + '\n  report. If an id was deliberately removed from the source, its entry goes'
      + `\n  with it — in both locales.\n`,
    );
    process.exit(1);
  }

  console.log(`✓ ${constructed.size} finding ids, listed on ${PAGES.length} pages`);
}

if (process.argv[1] && process.argv[1].endsWith('check-finding-ids.mjs')) main();
/* v8 ignore stop */
