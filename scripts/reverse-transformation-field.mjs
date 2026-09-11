#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { reviewBaseline, reviewInspection } from './transformation-field-baseline.mjs';
import { scenarios } from './reverse-transformation-field-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'dist/bin.js');
const ESLINT = path.join(ROOT, 'node_modules/.bin/eslint');
const TSC = path.join(ROOT, 'node_modules/.bin/tsc');
const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-reverse-field-'));
const commands = [];

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

  commands.push(record);

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

function config(framework, architecture) {
  return `export default ${JSON.stringify({
    framework,
    architecture: { alias: '~app', ...architecture },
    emit: { handbook: 'docs/architecture-handbook.md', agents: ['claude'] },
  }, null, 2)};\n`;
}

function packageJson(scenario) {
  return JSON.stringify({
    name: scenario.id,
    private: true,
    type: 'module',
    scripts: { lint: 'eslint .' },
    dependencies: scenario.dependencies,
  }, null, 2);
}

function tsconfig(additionalAliases = {}) {
  const paths = Object.fromEntries([
    ['~app/*', ['./src/*']],
    ...Object.entries(additionalAliases).map(([alias, target]) => [
      `${alias}/*`,
      [`./${target.replace(/^\.\//, '')}/*`],
    ]),
  ]);

  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      baseUrl: '.',
      paths,
      outDir: 'build',
    },
    include: ['src/**/*.ts', 'src/**/*.tsx'],
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

function initialize(scenario) {
  const repository = path.join(workRoot, scenario.id);
  const application = path.resolve(repository, scenario.application);

  fs.mkdirSync(application, { recursive: true });
  write(application, 'package.json', packageJson(scenario));
  write(application, 'tsconfig.json', tsconfig(scenario.additionalAliases));

  write(application, 'blueprint.config.mjs', config(scenario.framework, {
    additionalAliases: scenario.additionalAliases,
    modules: scenario.modules,
    layers: scenario.layers,
  }));

  write(repository, '.gitignore', 'node_modules/\nbuild/\n');

  for (const [file, content] of Object.entries(scenario.files)) {
    write(application, file, content);
  }

  linkRuntime(application);
  git(repository, 'init', '--quiet');
  git(repository, 'add', '.');
  commit(repository, 'module-first baseline');

  return { repository, application };
}

function commit(repository, message) {
  run(repository, 'git', [
    '-c', 'user.name=Blueprint Field',
    '-c', 'user.email=field@example.invalid',
    'commit', '--quiet', '-m', message,
  ]);
}

function readOptional(root, file) {
  const target = path.join(root, file);

  return fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : null;
}

function sourceFiles(application) {
  const root = path.join(application, 'src');
  const files = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(target);
      } else if (/\.(?:js|jsx|ts|tsx|vue)$/.test(entry.name)) {
        files.push(path.relative(application, target));
      }
    }
  }

  walk(root);

  return files.sort();
}

function sourceManifest(application, scenario) {
  const files = sourceFiles(application);

  const text = files.map((file) => fs.readFileSync(path.join(application, file), 'utf-8'))
    .join('\n');

  return {
    files,
    count: files.length,
    markers: Object.fromEntries(scenario.markers.map((marker) => [marker, text.includes(marker)])),
    allMarkersPresent: scenario.markers.every((marker) => text.includes(marker)),
  };
}

function prepareBaseline(context, scenario) {
  const inspection = cli(context.application, ['inspect', '--json'], [0, 1]);
  const review = reviewInspection(inspection, scenario.expectedInitialDebt);

  if (!review.approved) {
    throw new Error(`${scenario.id} initial debt differs from its reviewed ledger`);
  }

  cli(context.application, ['inspect', '--update-baseline']);

  const baseline = reviewBaseline(
    readOptional(context.application, '.blueprint-baseline.json'),
    scenario.expectedInitialDebt.filter((finding) => finding.severity !== 'info'),
  );

  if (!baseline.matches) {
    throw new Error(`${scenario.id} initial baseline differs from its reviewed ledger`);
  }

  git(context.repository, 'add', '.');

  if (git(context.repository, 'status', '--short')) {
    commit(context.repository, 'record reviewed module-first debt');
  }

  return { review, baseline };
}

function applyDecisions(context, scenario) {
  for (const [from, to] of scenario.moves) {
    fs.mkdirSync(path.dirname(path.join(context.application, to)), { recursive: true });
    git(context.application, 'mv', from, to);
  }

  for (const [file, content] of Object.entries(scenario.rewrites)) {
    write(context.application, file, content);
  }

  write(context.application, 'blueprint.config.mjs', config(scenario.framework, {
    additionalAliases: scenario.finalAdditionalAliases,
    layers: scenario.expectedLayers,
  }));

  write(context.application, 'tsconfig.json', tsconfig(scenario.finalAdditionalAliases));

  fs.rmSync(path.join(context.application, 'blueprint-authoring.md'));
  fs.rmSync(path.join(context.application, '.claude'), { recursive: true });
}

function aliasState(application, scenario) {
  const affected = scenario.affectedAliases ?? [];
  const configText = readOptional(application, 'blueprint.config.mjs') ?? '';
  const tsconfigText = readOptional(application, 'tsconfig.json') ?? '';

  const sourceText = sourceFiles(application)
    .map((file) => fs.readFileSync(path.join(application, file), 'utf-8'))
    .join('\n');

  return {
    affected,
    imports: Object.fromEntries(affected.map((alias) => [alias, sourceText.includes(`${alias}/`)])),
    configTargets: Object.fromEntries(affected.map((alias) => [
      alias,
      configText.includes(`"${alias}"`) || tsconfigText.includes(`"${alias}/*"`),
    ])),
  };
}

function assertPlaybook(application, scenario) {
  const playbook = fs.readFileSync(path.join(application, 'blueprint-authoring.md'), 'utf-8');

  for (const claim of scenario.playbookClaims) {
    if (!playbook.includes(claim)) {
      throw new Error(`${scenario.id} playbook missing: ${claim}`);
    }
  }

  if (!playbook.includes('not auto-sort layers')) {
    throw new Error(`${scenario.id} playbook does not preserve layer-order authority`);
  }
}

function hasEdge(output, [from, to]) {
  const report = JSON.parse(output);
  const unit = report.units.find((candidate) => candidate.unit === from);

  return unit?.imports.includes(to) === true;
}

function negativeControl(application, scenario) {
  write(
    application,
    scenario.negativeFile,
    `import '${scenario.negativeImport}';\nexport const forbidden = 1;\n`,
  );

  const inspect = cli(application, ['inspect', '--json'], [1]);
  const lint = run(application, ESLINT, [scenario.negativeFile], [1]);

  fs.rmSync(path.join(application, scenario.negativeFile));

  return { inspect: inspect.code, lint: lint.code, caught: inspect.code === 1 && lint.code === 1 };
}

function regressionControl(application, scenario) {
  write(
    application,
    scenario.negativeFile,
    `import '${scenario.negativeImport}';\nexport const regression = 1;\n`,
  );

  const before = readOptional(application, '.blueprint-baseline.json');
  const commandStart = commands.length;
  const inspection = cli(application, ['inspect', '--json'], [1]);
  const review = reviewInspection(inspection, []);

  const updateAttempted = commands.slice(commandStart).some(
    ({ command }) => command.includes('inspect --update-baseline'),
  );

  const unchanged = readOptional(application, '.blueprint-baseline.json') === before;

  fs.rmSync(path.join(application, scenario.negativeFile));

  return { rejected: !review.approved, updateAttempted, unchanged };
}

function gates(application, scenario) {
  write(application, 'tests/smoke.test.mjs', [
    'import assert from \'node:assert/strict\';',
    'import fs from \'node:fs\';',
    'import test from \'node:test\';',
    `test('route survives', () => assert.ok(fs.existsSync('${scenario.preservedRoute ?? scenario.moves[0][1]}')));`,
  ].join('\n'));

  const result = {
    inspect: cli(application, ['inspect', '--baseline', '--json']).code,
    deps: cli(application, ['deps', '--json']).code,
    lint: run(application, ESLINT, ['.']).code,
    typecheck: run(application, TSC, ['--noEmit']).code,
    test: run(application, process.execPath, ['--test', 'tests/smoke.test.mjs']).code,
    build: run(application, TSC, []).code,
    doctor: cli(application, ['doctor', '--json']).code,
  };

  fs.rmSync(path.join(application, 'build'), { recursive: true, force: true });

  return result;
}

function runScenario(scenario) {
  const context = initialize(scenario);
  const initial = prepareBaseline(context, scenario);
  const before = sourceManifest(context.application, scenario);
  const aliasesBefore = aliasState(context.application, scenario);

  cli(context.application, ['init', '--topology', 'layer-first', '--no-install']);
  assertPlaybook(context.application, scenario);
  applyDecisions(context, scenario);

  const inspection = cli(context.application, ['inspect', '--json'], [0, 1]);
  const baselineReview = reviewInspection(inspection, scenario.expectedPostTransformFindings);

  if (!baselineReview.approved) {
    throw new Error(
      `${scenario.id} has an unreviewed reverse-transformation finding\n`
      + JSON.stringify(baselineReview.actualFindings, null, 2),
    );
  }

  const baselineBefore = reviewBaseline(
    readOptional(context.application, '.blueprint-baseline.json'),
    scenario.expectedInitialDebt.filter((finding) => finding.severity !== 'info'),
  );

  const regression = regressionControl(context.application, scenario);

  cli(context.application, ['inspect', '--update-baseline']);

  const baselineAfter = reviewBaseline(
    readOptional(context.application, '.blueprint-baseline.json'),
    scenario.expectedPostTransformFindings.filter((finding) => finding.severity !== 'info'),
  );

  cli(context.application, ['init', '--topology', 'layer-first', '--no-install']);

  const after = sourceManifest(context.application, scenario);
  const aliasesAfter = aliasState(context.application, scenario);
  const deps = cli(context.application, ['deps', '--json']);
  const negative = negativeControl(context.application, scenario);

  const generated = {
    handbook: readOptional(context.application, 'docs/architecture-handbook.md'),
    contract: readOptional(context.application, 'CLAUDE.md'),
  };

  const generatedLayerFirst = generated.handbook?.includes('### Modules') === false
    && generated.contract?.includes('declared Layer → Unit topology') === true
    && generated.contract?.includes('dependsOn') === false;

  const gateResults = gates(context.application, scenario);
  const allGatesGreen = Object.values(gateResults).every((code) => code === 0);

  const manifestComplete = before.count === scenario.expectedSourceCount
    && after.count === scenario.expectedSourceCount
    && before.allMarkersPresent
    && after.allMarkersPresent;

  const routerPreserved = scenario.preservedRoute === null
    || fs.existsSync(path.join(context.application, scenario.preservedRoute));

  const aliasCutoverComplete = aliasesBefore.affected.every((alias) =>
    aliasesBefore.imports[alias]
    && aliasesBefore.configTargets[alias]
    && !aliasesAfter.imports[alias]
    && !aliasesAfter.configTargets[alias]);

  if (
    !baselineBefore.matches
    || !baselineAfter.matches
    || !regression.rejected
    || regression.updateAttempted
    || !regression.unchanged
    || !manifestComplete
    || !routerPreserved
    || !hasEdge(deps.output, scenario.positiveEdge)
    || (scenario.aliasEdge && !hasEdge(deps.output, scenario.aliasEdge))
    || !aliasCutoverComplete
    || !negative.caught
    || !generatedLayerFirst
    || !allGatesGreen
  ) {
    throw new Error(`${scenario.id} did not satisfy every reverse field invariant`);
  }

  return {
    id: scenario.id,
    initial,
    before,
    after,
    trackedMoves: scenario.moves,
    diffSummary: git(context.repository, 'diff', '--summary'),
    stagedDiffSummary: git(context.repository, 'diff', '--cached', '--summary'),
    baselineReview,
    baseline: { before: baselineBefore, after: baselineAfter, regression },
    positiveControl: true,
    negativeControl: negative,
    generatedLayerFirst,
    routerPreserved,
    aliasCutover: { before: aliasesBefore, after: aliasesAfter, complete: aliasCutoverComplete },
    gates: gateResults,
  };
}

if (!fs.existsSync(BIN)) {
  throw new Error('dist/bin.js is missing; run npm run build before this field replay.');
}

const report = {
  purpose: 'Durable #446 module-first → layer-first semantic replay.',
  workRoot,
  scenarios: scenarios.map(runScenario),
  commands,
};

write(workRoot, 'reverse-field-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
