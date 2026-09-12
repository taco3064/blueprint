import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  renderTestFilesEditorial,
  TEST_FILES_SEMANTIC_NODE,
} from '../dist/editorial.js';
import { verifyConsumers } from './editorial-consumers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const PUBLICATION = path.join(DOCS, 'publication');
const LOCALES = ['en', 'zh-TW'];

const SEMANTIC_EDITIONS = [
  'core',
  'deps',
  'gate-availability',
  'merge-scope',
  'reference',
  'survey',
];

export function composePublication() {
  const artifacts = generateArtifacts();

  const files = new Map([
    ['generated/fresh-vue-js/blueprint.config.mjs', artifacts.config],
    ['generated/fresh-vue-js/eslint.config.mjs', artifacts.eslint],
    ['generated/fresh-vue-js/architecture.md', artifacts.architecture],
    ['generated/fresh-vue-js/agent-contract.md', artifacts.agent],
  ]);

  for (const edition of SEMANTIC_EDITIONS) {
    for (const locale of LOCALES) {
      files.set(
        `semantic/test-files/${edition}.${locale}.md`,
        `${renderTestFilesEditorial(edition, locale)}\n`,
      );
    }
  }

  return files;
}

export function publish(mode, files = composePublication()) {
  verifyConsumers(DOCS);
  const stale = [];
  const expected = new Set([...files.keys()].map((relative) => path.join(PUBLICATION, relative)));

  for (const [relative, content] of files) {
    const target = path.join(PUBLICATION, relative);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;

    if (current === content) {
      continue;
    }

    if (mode === 'write') {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    } else {
      stale.push(path.relative(ROOT, target));
    }
  }

  for (const target of filesUnder(PUBLICATION)) {
    if (expected.has(target)) {
      continue;
    }

    if (mode === 'write') {
      fs.rmSync(target);
    } else {
      stale.push(path.relative(ROOT, target));
    }
  }

  if (stale.length) {
    throw new Error(`Editorial proof is stale:\n${stale.join('\n')}\nRun: npm run editorial:compose`);
  }
}

function filesUnder(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);

    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

function generateArtifacts() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-editorial-'));

  try {
    fs.cpSync(path.join(ROOT, 'fixtures/publication/fresh-vue-js'), temporary, {
      recursive: true,
    });

    const run = spawnSync(process.execPath, [
      path.join(ROOT, 'dist/bin.js'),
      'init',
      '--topology',
      'layer-first',
      '--preset',
      '--framework',
      'vue',
      '--no-install',
    ], { cwd: temporary, encoding: 'utf8' });

    if (run.status !== 0) {
      throw new Error(`Publication fixture init failed:\n${run.stderr || run.stdout}`);
    }

    const handbook = read(temporary, 'docs/architecture-handbook.md');

    return {
      config: read(temporary, 'blueprint.config.mjs'),
      eslint: read(temporary, 'eslint.config.mjs'),
      architecture: section(handbook, '## Architecture'),
      agent: read(temporary, 'AGENTS.md'),
    };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function section(markdown, heading) {
  const start = markdown.indexOf(`${heading}\n`);

  if (start < 0) {
    throw new Error(`Generated handbook is missing ${heading}.`);
  }

  const next = markdown.indexOf('\n## ', start + heading.length);

  return `${markdown.slice(start, next < 0 ? undefined : next).trimEnd()}\n`;
}

function main() {
  const mode = process.argv[2] === '--write' ? 'write' : 'check';

  publish(mode);

  console.log(
    `${mode === 'write' ? 'Composed' : 'Verified'} editorial publication from ${TEST_FILES_SEMANTIC_NODE}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
