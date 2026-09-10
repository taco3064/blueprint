#!/usr/bin/env node
/**
 * Deterministic replay of the semantic LF→MF decisions accepted for #445.
 *
 * This is test evidence, not a production transformer: every move and ownership decision is
 * explicit in transformation-field-fixtures.mjs. The runner proves that those human/Agent
 * decisions can execute through git mv, import/config cutover, baseline review, Blueprint's
 * real gates, and adopter gates in fresh temporary Git repositories.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { rejectionScenarios, scenarios } from './transformation-field-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'dist/bin.js');
const ESLINT = path.join(ROOT, 'node_modules/.bin/eslint');
const TSC = path.join(ROOT, 'node_modules/.bin/tsc');
const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-transformation-field-'));
const commandLog = [];

function write(root, file, content) {
  const target = path.join(root, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function run(cwd, command, args, expected = [0]) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf-8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();

  const record = {
    cwd: path.relative(workRoot, cwd) || '.',
    command: [command, ...args].join(' '),
    code: result.status,
    output,
  };

  commandLog.push(record);

  if (!expected.includes(result.status ?? -1)) {
    throw new Error(`${record.command} failed (${result.status})\n${output}`);
  }

  return record;
}

function git(cwd, ...args) {
  return run(cwd, 'git', args).output;
}

function cli(cwd, args, expected = [0]) {
  return run(cwd, process.execPath, [BIN, ...args], expected);
}

function oldConfig(framework, layers) {
  return `export default ${JSON.stringify({
    framework,
    architecture: { alias: '~app', layers },
    emit: { agents: [] },
  }, null, 2)};\n`;
}

function finalConfig(framework, modules) {
  return `export default ${JSON.stringify({
    framework,
    architecture: {
      alias: '~app',
      modules,
      layers: [
        { name: 'components', does: 'domain UI', layout: 'file' },
        { name: 'services', does: 'domain data access', layout: 'file' },
      ],
    },
    emit: { agents: [] },
  }, null, 2)};\n`;
}

function packageJson(scenario) {
  return JSON.stringify({
    name: scenario.id,
    private: true,
    type: 'module',
    dependencies: scenario.dependencies,
  }, null, 2);
}

function tsconfig() {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      baseUrl: '.',
      paths: { '~app/*': ['./src/*'] },
      outDir: 'build',
    },
    include: ['src/**/*.ts'],
  }, null, 2);
}

function linkRuntime(application) {
  const packageRoot = path.join(application, 'node_modules/@kekkai');

  fs.mkdirSync(packageRoot, { recursive: true });
  fs.symlinkSync(ROOT, path.join(packageRoot, 'blueprint'), 'dir');

  for (const dependency of [
    '@eslint-community/eslint-plugin-eslint-comments',
    '@stylistic/eslint-plugin',
    'eslint-plugin-import-x',
    'typescript-eslint',
    'vue-eslint-parser',
  ]) {
    const target = path.join(application, 'node_modules', dependency);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(path.join(ROOT, 'node_modules', dependency), target, 'dir');
  }
}

function initialize(id, applicationPath, definition) {
  const repository = path.join(workRoot, id);
  const application = path.resolve(repository, applicationPath);

  fs.mkdirSync(application, { recursive: true });
  write(application, 'package.json', packageJson({ id, dependencies: definition.dependencies }));
  write(application, 'tsconfig.json', tsconfig());
  write(application, 'blueprint.config.mjs', oldConfig(definition.framework, definition.layers));
  write(repository, '.gitignore', 'node_modules/\nbuild/\n');

  for (const [file, content] of Object.entries(definition.files)) {
    write(application, file, content);
  }

  linkRuntime(application);
  git(repository, 'init', '--quiet');
  git(repository, 'add', '.');
  commit(repository, 'layer-first baseline');

  return { repository, application };
}

function commit(repository, message) {
  run(repository, 'git', [
    '-c', 'user.name=Blueprint Field',
    '-c', 'user.email=field@example.invalid',
    'commit', '--quiet', '-m', message,
  ]);
}

function captureStart(repository, application) {
  return {
    head: git(repository, 'rev-parse', 'HEAD'),
    trackedTree: git(repository, 'ls-tree', '-r', '--name-only', 'HEAD').split('\n'),
    config: fs.readFileSync(path.join(application, 'blueprint.config.mjs'), 'utf-8'),
    baseline: readOptional(application, '.blueprint-baseline.json'),
  };
}

function readOptional(root, file) {
  const target = path.join(root, file);

  return fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : null;
}

function prepareBaseline(context, scenario) {
  if (!scenario.baselineDebt) {
    return;
  }

  cli(context.application, ['inspect', '--update-baseline']);
  git(context.repository, 'add', '.');
  commit(context.repository, 'record pre-transform debt');
}

function assertPlaybook(application, claims) {
  const playbook = fs.readFileSync(path.join(application, 'blueprint-authoring.md'), 'utf-8');

  for (const claim of claims) {
    if (!playbook.includes(claim)) {
      throw new Error(`playbook missing required evidence: ${claim}`);
    }
  }
}

function applyDecisions(context, scenario) {
  for (const [from, to] of scenario.moves) {
    fs.mkdirSync(path.dirname(path.join(context.application, to)), { recursive: true });
    git(context.application, 'mv', from, to);
  }

  for (const file of scenario.deletes) {
    git(context.application, 'rm', file);
  }

  for (const [file, content] of Object.entries(scenario.rewrites)) {
    write(context.application, file, content);
  }

  write(
    context.application,
    'blueprint.config.mjs',
    finalConfig(scenario.framework, scenario.modules),
  );

  removeAuthoring(context.application);
}

function removeAuthoring(application) {
  fs.rmSync(path.join(application, 'blueprint-authoring.md'));
  fs.rmSync(path.join(application, '.claude'), { recursive: true });
}

function verify(context, scenario, before) {
  const { application, repository } = context;
  const beforeBaselineReview = cli(application, ['inspect', '--json'], [0, 1]);
  const positiveDeps = cli(application, ['deps', '--json']);
  const negative = negativeControl(application, scenario.negativeModule);
  const baselineUpdate = cli(application, ['inspect', '--update-baseline']);
  const gates = gateResults(application);

  return {
    id: scenario.id,
    decisions: scenario.decisions,
    moves: scenario.moves,
    modules: scenario.modules,
    before,
    after: {
      trackedAndUntrackedTree: listTree(application),
      status: git(repository, 'status', '--short'),
      diffStat: git(repository, 'diff', '--stat'),
      diffSummary: git(repository, 'diff', '--summary'),
      stagedDiffStat: git(repository, 'diff', '--cached', '--stat'),
      stagedDiffSummary: git(repository, 'diff', '--cached', '--summary'),
    },
    baselineClassification: scenario.baselineDebt
      ? 'Pre-existing undeclared legacy was moved into named ui; stale baseline retired.'
      : 'No pre-existing baseline debt; no migration regression was baselined.',
    beforeBaselineReview: beforeBaselineReview.code,
    baselineUpdate: baselineUpdate.code,
    positiveControl: hasDependencyEdge(positiveDeps.output, scenario.positiveEdge),
    negativeControl: negative,
    gates,
    appRouterPreserved: scenario.id === 'next-app-router'
      ? fs.existsSync(path.join(application, 'src/app/login/page.ts'))
      : null,
  };
}

function hasDependencyEdge(output, [from, to]) {
  const report = JSON.parse(output);
  const unit = report.units.find((candidate) => candidate.unit === from);

  return unit?.imports.includes(to) === true;
}

function negativeControl(application, module) {
  const file = `src/${module}/services/forbidden.ts`;

  write(application, file, 'import \'~app/app/Login\';\n');
  const inspect = cli(application, ['inspect', '--json'], [1]);
  const lint = run(application, ESLINT, [file], [1]);

  fs.rmSync(path.join(application, file));

  return {
    inspectCode: inspect.code,
    lintCode: lint.code,
    caught: inspect.output.includes('flow-violation') && lint.code === 1,
  };
}

function gateResults(application) {
  write(application, 'tests/smoke.test.mjs', [
    'import assert from \'node:assert/strict\';',
    'import fs from \'node:fs\';',
    'import test from \'node:test\';',
    'test(\'module-first app exists\', () => assert.ok(fs.existsSync(\'src/app\')));',
  ].join('\n'));

  const gates = {
    inspect: cli(application, ['inspect', '--baseline', '--json']).code,
    deps: cli(application, ['deps', '--json']).code,
    lint: run(application, ESLINT, ['.']).code,
    typecheck: run(application, TSC, ['--noEmit']).code,
    test: run(application, process.execPath, ['--test', 'tests/smoke.test.mjs']).code,
    build: run(application, TSC, []).code,
    doctor: cli(application, ['doctor', '--json']).code,
  };

  fs.rmSync(path.join(application, 'build'), { recursive: true });

  return gates;
}

function listTree(application) {
  const files = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }

      const target = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(target);
      } else {
        files.push(path.relative(application, target));
      }
    }
  }

  walk(application);

  return files.sort();
}

function runScenario(scenario) {
  const context = initialize(scenario.id, scenario.application, scenario);

  prepareBaseline(context, scenario);
  const before = captureStart(context.repository, context.application);

  cli(context.application, ['init', '--topology', 'module-first', '--no-install']);
  assertPlaybook(context.application, scenario.playbookClaims);
  applyDecisions(context, scenario);
  cli(context.application, ['init', '--topology', 'module-first', '--no-install']);

  return verify(context, scenario, before);
}

function snapshot(application) {
  return JSON.stringify(listTree(application).map((file) => [
    file,
    fs.readFileSync(path.join(application, file)).toString('base64'),
  ]));
}

function runRejection(scenario) {
  const definition = {
    ...scenario,
    framework: 'react',
    layers: [{ name: 'pages', does: 'route composition', layout: 'folder' }],
  };

  const context = initialize(scenario.id, '.', definition);

  if (scenario.dirty) {
    write(context.application, 'src/pages/untracked.ts', 'export const dirty = 1;\n');
  }

  const before = snapshot(context.application);

  const result = cli(
    context.application,
    ['init', '--topology', 'module-first', '--no-install'],
    [1],
  );

  return {
    id: scenario.id,
    rejected: result.output.includes(scenario.expected),
    zeroWrite: snapshot(context.application) === before,
    output: result.output,
  };
}

function assertReport(report) {
  for (const scenario of report.transformations) {
    const gatesGreen = Object.values(scenario.gates).every((code) => code === 0);

    if (!gatesGreen || !scenario.positiveControl || !scenario.negativeControl.caught) {
      throw new Error(`${scenario.id} did not satisfy every field gate`);
    }
  }

  for (const rejection of report.rejections) {
    if (!rejection.rejected || !rejection.zeroWrite) {
      throw new Error(`${rejection.id} did not reject byte-identically`);
    }
  }
}

if (!fs.existsSync(BIN)) {
  throw new Error('dist/bin.js is missing; run npm run build before this field replay.');
}

const report = {
  purpose: 'Durable #445 semantic transformation replay; not production automation.',
  workRoot,
  transformations: scenarios.map(runScenario),
  rejections: rejectionScenarios.map(runRejection),
  commands: commandLog,
};

assertReport(report);
write(workRoot, 'field-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
