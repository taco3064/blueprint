#!/usr/bin/env node
// Vitepress compiles markdown pages as Vue templates, so a bare
// `<token>` in prose reads as an unclosed HTML tag and kills the docs
// build ("Element is missing end tag"). The 2.0.0 release shipped while
// the docs pipeline was red for exactly this — an unescaped
// ("lint": "eslint <root>") written in a changeset months of commits
// upstream of where it exploded. Code spans and fences are safe; bare
// tokens are not. This checks the source (changesets) and the sink
// (CHANGELOG.md, @included into the docs) — wired into lint-staged for
// those files, and run ahead of the vitepress build so the failure has
// a name and a fix instead of a compiler stack.
import fs from 'node:fs';
import path from 'node:path';

const targets = process.argv.slice(2);

const files = targets.length
  ? targets
  : [
      'CHANGELOG.md',
      ...(fs.existsSync('.changeset')
        ? fs
            .readdirSync('.changeset')
            .filter((name) => name.endsWith('.md'))
            .map((name) => path.join('.changeset', name))
        : []),
    ];

let bad = 0;

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  const text = fs
    .readFileSync(file, 'utf-8')
    // Strip fenced blocks line-preservingly so reported lines stay true.
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ''))
    .replace(/`[^`\n]*`/g, '');

  text.split('\n').forEach((line, index) => {
    const hit = line.match(/<[A-Za-z][-A-Za-z0-9]*/);

    if (hit) {
      console.error(
        `${file}:${index + 1}: bare "${hit[0]}…" — vitepress compiles this page as a `
        + 'Vue template, so it reads as an unclosed HTML tag and kills the docs '
        + 'build. Wrap it in backticks.',
      );
      bad += 1;
    }
  });
}

process.exit(bad ? 1 : 0);
