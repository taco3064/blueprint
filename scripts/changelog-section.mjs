#!/usr/bin/env node
// GitHub Releases are the only channel that announces a version: npm shows
// a number and a date, Dependabot/Renovate paste release notes into the
// upgrade PR an adopting agent reads, and "Watch → Releases only" is the
// only subscription a consumer has. Writing those notes by hand is a third
// copy of the changelog that drifts, so the release workflow generates them
// from CHANGELOG.md instead — this cuts out one version's section.
//
// Print the body of `## <version>` (heading excluded) to stdout, so the
// caller can pipe it into `gh release create --notes-file`.
import fs from 'node:fs';

const [rawVersion, file = 'CHANGELOG.md'] = process.argv.slice(2);

if (!rawVersion) {
  console.error(
    'Usage: node scripts/changelog-section.mjs <version> [changelog-path]\n'
    + 'Prints the CHANGELOG.md section for that version, for use as release notes.',
  );

  process.exit(1);
}

// Tags in this repo carry the `v` inconsistently (`1.0.3`, `v1.1.0`); the
// changelog headings never do. Normalize both ends rather than the tags,
// which are immutable once pushed.
const version = rawVersion.replace(/^v/, '');
const lines = fs.readFileSync(file, 'utf-8').split('\n');
const start = lines.findIndex((line) => line.replace(/^## v?/, '## ').trim() === `## ${version}`);

if (start === -1) {
  console.error(
    `❌ No "## ${version}" section in ${file}\n`
    + `Fix: the release notes come from the changelog, so a version without a section has `
    + `nothing to announce — run 'npx changeset version' and commit before tagging.`,
  );

  process.exit(1);
}

const rest = lines.slice(start + 1);
const end = rest.findIndex((line) => line.startsWith('## '));
const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();

if (!body) {
  console.error(`❌ The "## ${version}" section in ${file} is empty — nothing to publish as notes.`);
  process.exit(1);
}

console.log(body);
