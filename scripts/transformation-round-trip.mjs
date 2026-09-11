#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { reviewInspection } from './transformation-field-baseline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'dist/bin.js');
const ESLINT = path.join(ROOT, 'node_modules/.bin/eslint');
const TSC = path.join(ROOT, 'node_modules/.bin/tsc');
const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-round-trip-'));
const commands = [];

function write(file, content) {
  const target = path.join(repository, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function run(command, args, expected = [0]) {
  const result = spawnSync(command, args, { cwd: repository, encoding: 'utf-8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const record = { command: [command, ...args].join(' '), code: result.status, output };

  commands.push(record);

  if (!expected.includes(result.status ?? -1)) {
    throw new Error(`${record.command} failed (${result.status})\n${output}`);
  }

  return record;
}

function git(...args) {
  return run('git', args).output;
}

function cli(args, expected = [0]) {
  return run(process.execPath, [BIN, ...args], expected);
}

function commit(message) {
  git('add', '.');

  run('git', [
    '-c', 'user.name=Blueprint Field',
    '-c', 'user.email=field@example.invalid',
    'commit', '--quiet', '-m', message,
  ]);
}

function config(architecture) {
  return `export default ${JSON.stringify({
    framework: 'react',
    architecture: { alias: '~app', ...architecture },
    emit: { handbook: 'docs/architecture-handbook.md', agents: [] },
  }, null, 2)};\n`;
}

function linkRuntime() {
  const packageRoot = path.join(repository, 'node_modules/@kekkai');

  fs.mkdirSync(packageRoot, { recursive: true });
  fs.symlinkSync(ROOT, path.join(packageRoot, 'blueprint'), 'dir');

  for (const dependency of [
    '@eslint-community/eslint-plugin-eslint-comments',
    '@stylistic/eslint-plugin',
    'eslint-plugin-import-x',
    'typescript-eslint',
    'vue-eslint-parser',
  ]) {
    const target = path.join(repository, 'node_modules', dependency);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(path.join(ROOT, 'node_modules', dependency), target, 'dir');
  }
}

function move(from, to) {
  fs.mkdirSync(path.dirname(path.join(repository, to)), { recursive: true });
  git('mv', from, to);
}

function removeAuthoring() {
  fs.rmSync(path.join(repository, 'blueprint-authoring.md'));
  fs.rmSync(path.join(repository, '.claude'), { recursive: true });
}

function manifest() {
  const files = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(target);
      } else if (/\.(?:js|jsx|ts|tsx|vue)$/.test(entry.name)) {
        files.push(path.relative(repository, target));
      }
    }
  }

  walk(path.join(repository, 'src'));

  const text = files.map((file) => fs.readFileSync(path.join(repository, file), 'utf-8'))
    .join('\n');

  const markers = ['wiring', 'route', 'authContainer', 'authHook', 'sessionService'];

  return {
    files: files.sort(),
    count: files.length,
    markers: Object.fromEntries(markers.map((marker) => [marker, text.includes(marker)])),
    complete: files.length === 5 && markers.every((marker) => text.includes(marker)),
  };
}

function report(args) {
  return JSON.parse(cli(args).output);
}

function edge(result, from, to) {
  return result.units.find((unit) => unit.unit === from)?.imports.includes(to) === true;
}

write('package.json', JSON.stringify({
  name: 'semantic-round-trip',
  private: true,
  type: 'module',
  scripts: { lint: 'eslint .' },
  dependencies: {
    react: '^18',
    typescript: '^5',
    '@kekkai/blueprint': '4.0.0',
  },
}, null, 2));

write('tsconfig.json', JSON.stringify({
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
}, null, 2));

write('.gitignore', 'node_modules/\nbuild/\n');

write('blueprint.config.mjs', config({
  layers: [
    { name: 'pages', does: 'routes', layout: 'file' },
    { name: 'containers', does: 'orchestration', layout: 'folder', entry: 'index' },
    { name: 'hooks', does: 'state', layout: 'file' },
    { name: 'services', does: 'data', layout: 'file' },
  ],
}));

write('src/main.ts', 'import \'~app/pages/Login\';\nexport const wiring = \'wiring\';\n');

write('src/pages/Login.ts', [
  'import \'~app/containers/Auth\';',
  'export const route = \'route\';',
].join('\n'));

write('src/containers/Auth/index.ts', [
  'import \'~app/hooks/useAuth\';',
  'void import(\'~app/services/session\');',
  'export const authContainer = \'authContainer\';',
].join('\n'));

write('src/hooks/useAuth.ts', 'export const authHook = \'authHook\';\n');
write('src/services/session.ts', 'export const sessionService = \'sessionService\';\n');
linkRuntime();
git('init', '--quiet');
commit('layer-first origin');

const origin = manifest();

cli(['init', '--topology', 'module-first', '--no-install']);

const forwardPlaybook = fs.readFileSync(
  path.join(repository, 'blueprint-authoring.md'),
  'utf-8',
);

if (!forwardPlaybook.includes('layer-first → module-first transformation playbook')) {
  throw new Error('round trip did not enter the accepted #445 path');
}

move('src/pages/Login.ts', 'src/app/Login.ts');
move('src/containers/Auth/index.ts', 'src/auth/components/Auth.ts');
move('src/hooks/useAuth.ts', 'src/auth/hooks/useAuth.ts');
move('src/services/session.ts', 'src/auth/services/session.ts');
write('src/main.ts', 'import \'~app/app/Login\';\nexport const wiring = \'wiring\';\n');

write('src/app/Login.ts', [
  'import \'~app/auth/components/Auth\';',
  'export const route = \'route\';',
].join('\n'));

write('src/auth/components/Auth.ts', [
  'import \'~app/auth/hooks/useAuth\';',
  'void import(\'~app/auth/services/session\');',
  'export const authContainer = \'authContainer\';',
].join('\n'));

write('blueprint.config.mjs', config({
  modules: [
    { name: 'app', does: 'router composition', dependsOn: ['auth'] },
    { name: 'auth', does: 'authentication' },
  ],
  layers: [
    { name: 'components', does: 'UI', layout: 'file' },
    { name: 'hooks', does: 'state', layout: 'file' },
    { name: 'services', does: 'data', layout: 'file' },
  ],
}));

removeAuthoring();
cli(['init', '--topology', 'module-first', '--no-install']);

const middleInspect = report(['inspect', '--json']);
const middleDeps = report(['deps', '--json']);

if (!middleInspect.ok || !edge(middleDeps, 'app', 'auth/components')) {
  throw new Error('round trip lost module-first identity or DAG semantics');
}

commit('accepted semantic module-first state');
cli(['init', '--topology', 'layer-first', '--no-install']);

const reversePlaybook = fs.readFileSync(
  path.join(repository, 'blueprint-authoring.md'),
  'utf-8',
);

if (!reversePlaybook.includes('module-first → layer-first transformation playbook')) {
  throw new Error('round trip did not enter the #446 reverse path');
}

move('src/app/Login.ts', 'src/pages/Login.ts');
move('src/auth/components/Auth.ts', 'src/components/Auth.ts');
move('src/auth/hooks/useAuth.ts', 'src/hooks/useAuth.ts');
move('src/auth/services/session.ts', 'src/services/session.ts');
write('src/main.ts', 'import \'~app/pages/Login\';\nexport const wiring = \'wiring\';\n');

write('src/pages/Login.ts', [
  'import \'~app/components/Auth\';',
  'export const route = \'route\';',
].join('\n'));

write('src/components/Auth.ts', [
  'import \'~app/hooks/useAuth\';',
  'void import(\'~app/services/session\');',
  'export const authContainer = \'authContainer\';',
].join('\n'));

write('blueprint.config.mjs', config({
  layers: [
    { name: 'pages', does: 'routes', layout: 'file' },
    { name: 'components', does: 'UI', layout: 'file' },
    { name: 'hooks', does: 'state', layout: 'file' },
    { name: 'services', does: 'data', layout: 'file' },
  ],
}));

removeAuthoring();

const postInspection = cli(['inspect', '--json']);
const baselineReview = reviewInspection(postInspection, []);

if (!baselineReview.approved) {
  throw new Error('round trip produced an unreviewed finding before baseline update');
}

write('src/services/regression.ts', 'import \'~app/pages/Login\';\n');
const regressionCommandStart = commands.length;
const regression = reviewInspection(cli(['inspect', '--json'], [1]), []);

const regressionUpdateAttempted = commands.slice(regressionCommandStart).some(
  ({ command }) => command.includes('inspect --update-baseline'),
);

fs.rmSync(path.join(repository, 'src/services/regression.ts'));

if (regression.approved || regressionUpdateAttempted) {
  throw new Error('round-trip regression could be swallowed before baseline review');
}

cli(['inspect', '--update-baseline']);
cli(['init', '--topology', 'layer-first', '--no-install']);

const finalManifest = manifest();
const finalInspect = report(['inspect', '--baseline', '--json']);
const finalDeps = report(['deps', '--json']);

const gates = {
  lint: run(ESLINT, ['.']).code,
  typecheck: run(TSC, ['--noEmit']).code,
  build: run(TSC, []).code,
  doctor: cli(['doctor', '--json']).code,
};

const semantic = origin.complete
  && finalManifest.complete
  && finalInspect.ok
  && finalInspect.coverage.sourceFiles === 5
  && finalInspect.coverage.layerFiles === 4
  && finalInspect.coverage.outsideNets.includes('src/main.ts')
  && edge(finalDeps, 'pages', 'components')
  && edge(finalDeps, 'components', 'hooks')
  && edge(finalDeps, 'components', 'services')
  && Object.values(gates).every((code) => code === 0);

if (!semantic) {
  throw new Error('round trip did not preserve semantic source, wiring, imports, or gates');
}

const reportData = {
  purpose: 'Durable #446 LF → MF → LF semantic round trip.',
  repository,
  origin,
  middle: { inspect: middleInspect, deps: middleDeps },
  final: { manifest: finalManifest, inspect: finalInspect, deps: finalDeps },
  baselineRegressionRejected: !regression.approved,
  baselineUpdateAttemptedBeforeRepair: regressionUpdateAttempted,
  supportedDynamicImportPreserved: edge(finalDeps, 'components', 'services'),
  moduleDagRemoved: !fs.readFileSync(path.join(repository, 'blueprint.config.mjs'), 'utf-8')
    .includes('modules'),
  gates,
  commands,
};

write('round-trip-report.json', `${JSON.stringify(reportData, null, 2)}\n`);
console.log(JSON.stringify(reportData, null, 2));
