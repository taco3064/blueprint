import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { addControls, CONTROL_PATHS, fixtureBlueprint, git, makeFixture }
  from './source-scan-benchmark-fixtures.mjs';

export function assertCountBounds(record) {
  if (record.demand === 'governed-source') {
    assert.deepEqual([
      record.outside.directoryWalks, record.outside.inventoryFiles,
      record.outside.readFiles, record.outside.parsedFiles,
    ], [0, 0, 0, 0]);

    assert.equal(record.scopeStatus, 'not-requested');

    return;
  }

  assert.equal(record.inventoryMode, 'git-visible');
  assert.equal(new Set(record.outsidePaths).size, record.outsidePaths.length);

  for (const control of CONTROL_PATHS) {
    assert.ok(record.outsidePaths.includes(control), `Missing positive control: ${control}`);
  }

  assert.ok(!record.outsidePaths.some((name) => /\/noise\/|^build\//.test(name)));
  assert.ok(!record.outsidePaths.some((name) => /node_modules|^unrelated\/|\.test\.ts$/.test(name)));
  assert.equal(record.outside.parsedFiles, record.outsidePaths.length);
  assert.equal(record.outside.readFiles, record.outsidePaths.length);

  if (record.fixture !== 'clean-blueprint') {
    assert.equal(record.scopeStatus, 'complete');
    assert.deepEqual(record.outsidePaths, [...CONTROL_PATHS].sort());
    assert.equal(record.outside.inventoryFiles, CONTROL_PATHS.length + 1);
    assert.equal(record.outside.testFilesExcluded, 1);

    assert.deepEqual(record.outside.contributions, {
      repositoryVisible: 4, explicitConsumerRoot: 3, governedReference: 2,
    });

    assert.deepEqual(record.governed, { inventoryFiles: 1, readFiles: 1, parsedFiles: 1 });
  }
}

export function timingBounds(records) {
  const get = (revision, fixture, demand) => records.find((record) =>
    record.revision === revision && record.fixture === fixture && record.demand === demand);

  const checks = [
    ['source-only-noise', get('candidate', 'single-package', 'governed-source'),
      get('candidate', 'single-package-noise', 'governed-source'), 0.10, 25],
    ['full-noise', get('candidate', 'single-package', 'application-scope'),
      get('candidate', 'single-package-noise', 'application-scope'), 0.15, 50],
    ['clean-base-regression', get('base', 'clean-blueprint', 'application-scope'),
      get('candidate', 'clean-blueprint', 'application-scope'), 0.15, 50],
  ];

  return checks.map(([name, baseline, candidate, percentage, absoluteMs]) => {
    const allowanceMs = Math.max(baseline.medianMs * percentage, absoluteMs);
    const deltaMs = candidate.medianMs - baseline.medianMs;

    return { name, baselineMs: baseline.medianMs, candidateMs: candidate.medianMs,
      deltaMs, allowanceMs, passed: deltaMs <= allowanceMs };
  });
}

function archive(root, revision, target) {
  fs.mkdirSync(target, { recursive: true });
  const tar = execFileSync('git', ['-C', root, 'archive', revision], { maxBuffer: 128 * 1024 * 1024 });

  execFileSync('tar', ['-xf', '-', '-C', target], { input: tar });
}

function cleanFixture(root, base, temporary) {
  const target = path.join(temporary, 'clean-blueprint');

  archive(root, base, target);
  git(target, 'init', '-q');
  git(target, 'add', '.');
  addControls(target);

  return { name: 'clean-blueprint', root: target, blueprint: fixtureBlueprint() };
}

function revisions(root, base, temporary, tree) {
  const head = git(root, 'rev-parse', 'HEAD');
  const headTree = git(root, 'rev-parse', 'HEAD^{tree}');
  const candidateTree = tree ?? headTree;

  git(root, 'diff', '--quiet', candidateTree, '--', 'src', 'package.json', 'package-lock.json');

  const baseline = path.join(temporary, 'base-code');

  archive(root, base, baseline);
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), 'junction');

  return [
    { revision: 'base', commit: git(root, 'rev-parse', base),
      tree: git(root, 'rev-parse', `${base}^{tree}`), codeRoot: baseline,
      legacy: !fs.existsSync(path.join(baseline, 'src/inspect/facts.ts')) },
    { revision: 'candidate', commit: candidateTree === headTree ? head : null,
      baseCommit: head, tree: candidateTree, codeRoot: root, legacy: false },
  ];
}

function runMeasurements(fixtures, versions, temporary) {
  const records = [];
  const worker = fileURLToPath(new URL('./source-scan-benchmark-worker.mjs', import.meta.url));
  const specPath = path.join(temporary, 'spec.json');

  for (const fixture of fixtures) {
    for (const demand of ['governed-source', 'application-scope']) {
      for (const version of versions) {
        fs.writeFileSync(specPath, JSON.stringify({ ...version, fixture, demand }));
        process.stderr.write(`${version.revision}: ${fixture.name} / ${demand}\n`);

        const output = execFileSync(process.execPath, [worker, '--spec', specPath], {
          encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
        });

        const record = JSON.parse(output);

        if (version.revision === 'candidate') {
          assertCountBounds(record);
        }

        records.push(record);
      }
    }
  }

  return records;
}

export function runBenchmark({ root, base, tree = null }) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-scan-benchmark-'));

  try {
    const fixtures = [
      cleanFixture(root, base, temporary),
      makeFixture(temporary, 'single-package'),
      makeFixture(temporary, 'single-package-noise', { noise: true }),
      makeFixture(temporary, 'nested-monorepo', { nested: true, noise: true }),
    ];

    const records = runMeasurements(fixtures, revisions(root, base, temporary, tree), temporary);

    return { records, timingBounds: timingBounds(records) };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const value = (name) => args[args.indexOf(name) + 1];

  assert.ok(args.includes('--base'), 'Usage: node scripts/source-scan-benchmark.mjs --base SHA [--tree TREE]');
  const root = fileURLToPath(new URL('../', import.meta.url));

  const report = runBenchmark({ root, base: value('--base'),
    tree: args.includes('--tree') ? value('--tree') : null });

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exitCode = report.timingBounds.every((bound) => bound.passed) ? 0 : 1;
}
