#!/usr/bin/env node
/**
 * Verify the built artifact the way a consumer meets it.
 *
 * Everything in `src/**` is tested in-process: the suite imports `run` from
 * `../cli` and `runInit` from `../bootstrap`, which is the right shape for
 * asserting behaviour but never touches the layer between `dist/` and an
 * adopter. Nothing before this script executes `dist/bin.js`, resolves the
 * `bin` field, or imports `dist/index.js` — so the bundle, the shebang, the
 * package entry points, and the `argv[1]` guard were verified only by
 * `npm run field:run` (which installs a packed tarball) and by hand.
 *
 * The guard is the reason this exists rather than a nice-to-have. npm installs
 * the bin as a symlink at `node_modules/.bin/blueprint`; Node resolves the entry
 * module to its REAL path while `argv[1]` keeps the symlink path, so comparing
 * them without `realpathSync` makes the published CLI a silent no-op that exits
 * 0 — the 0.1.1 bug. In-process tests cannot see it: they call `run()` directly,
 * and the guard carries a v8-ignore marker precisely because it has no
 * in-process meaning.
 *
 * Run after `npm run build`. Exits non-zero on the first failure with the
 * command, the expectation, and what happened instead.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const temps = [];

async function check(what, fn) {
  try {
    const detail = await fn();

    console.log(`  ✓ ${what}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    failures.push({ what, message: error.message });
    console.log(`  ✗ ${what}\n      ${error.message.split('\n').join('\n      ')}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

/** Spawn a command, returning its exit code and combined output. */
function runCmd(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
  });

  if (result.error) throw new Error(`could not spawn ${command}: ${result.error.message}`);

  return {
    code: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function runNpm(args, options = {}) {
  if (process.env.npm_execpath) {
    return runCmd(process.execPath, [process.env.npm_execpath, ...args], options);
  }

  return process.platform === 'win32'
    ? runCmd(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm', ...args], options)
    : runCmd('npm', args, options);
}

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  temps.push(dir);

  return dir;
}

function snapshotTree(dir, current = dir) {
  const snapshot = {};

  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const target = path.join(current, entry.name);

    if (entry.isDirectory()) {
      Object.assign(snapshot, snapshotTree(dir, target));
    } else {
      snapshot[path.relative(dir, target)] = fs.readFileSync(target).toString('base64');
    }
  }

  return JSON.stringify(snapshot);
}

function snapshotProductTree(dir, current = dir) {
  const snapshot = {};

  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;

    const target = path.join(current, entry.name);

    if (entry.isDirectory()) {
      Object.assign(snapshot, snapshotProductTree(dir, target));
    } else {
      snapshot[path.relative(dir, target)] = fs.readFileSync(target).toString('base64');
    }
  }

  return JSON.stringify(snapshot);
}

function writeReactFixture(dir) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies: { react: '^19' } }),
  );
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

console.log('dist/ — the artifact as a consumer meets it\n');

// ---------------------------------------------------------------- the bin field

const binField = pkg.bin?.blueprint;
const binPath = binField ? path.join(root, binField) : null;

await check('package.json declares a bin, and the file is there', () => {
  expect(binField, 'package.json has no bin.blueprint entry');
  expect(fs.existsSync(binPath), `bin.blueprint points at ${binField}, which does not exist`);

  return binField;
});

await check('the bin opens with a node shebang', () => {
  // Without it, the symlink npm installs is not executable by the shell at all.
  const first = fs.readFileSync(binPath, 'utf-8').split('\n')[0];

  expect(
    first === '#!/usr/bin/env node',
    `first line is ${JSON.stringify(first)}, not a node shebang`,
  );

  return first;
});

await check('every path in `files` exists', () => {
  // `files` is what npm packs. A stale entry ships nothing and fails silently.
  const missing = (pkg.files ?? []).filter((entry) => !fs.existsSync(path.join(root, entry)));

  expect(!missing.length, `listed in files but absent: ${missing.join(', ')}`);

  return (pkg.files ?? []).join(', ');
});

// ------------------------------------------------------------- running the bin

await check('`--version` prints the package version and exits 0', () => {
  const { code, output } = runCmd(process.execPath, [binPath, '--version']);

  expect(code === 0, `exited ${code}`);
  expect(output.includes(pkg.version), `printed ${JSON.stringify(output.trim())}, not ${pkg.version}`);

  return output.trim();
});

await check('`--help` prints the usage banner and exits 0', () => {
  const { code, output } = runCmd(process.execPath, [binPath, '--help']);
  const init = runCmd(process.execPath, [binPath, 'init', '--help']);

  expect(code === 0, `exited ${code}`);
  expect(output.includes('Architecture as Code'), 'usage banner missing from the output');
  expect(init.code === 0, `init --help exited ${init.code}`);
  expect(init.output.includes('--topology layer-first|module-first'), 'topology selector is missing');

  return `${output.split('\n').length} lines`;
});

await check('an unknown command exits 1', () => {
  // The exit code is what a CI step or a scripted adoption reads.
  const { code } = runCmd(process.execPath, [binPath, 'bogus']);

  expect(code === 1, `exited ${code}, expected 1`);

  return 'code 1';
});

await check('`inspect` on an undetectable stack exits 1 and names the flag', () => {
  const dir = tempDir('bp-dist-inspect-');

  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }));

  const { code, output } = runCmd(process.execPath, [binPath, 'inspect'], { cwd: dir });

  expect(code === 1, `exited ${code}, expected 1`);
  expect(output.includes('--framework'), 'the failure does not name the flag that resolves it');

  return 'code 1, names --framework';
});

await check('`inspect` reddens on a real violation, through the bundle', () => {
  // The exit code is what a pre-commit hook or a CI step reads, and it comes out
  // of a chain — detect, resolve, scan, analyze, report — that only the bundle
  // wires together this way.
  const dir = tempDir('bp-dist-dirty-');

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies: { vue: '^3' } }),
  );

  fs.mkdirSync(path.join(dir, 'src', 'utils'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'utils', 'helper.ts'), 'export const x = 1;');

  const { code, output } = runCmd(process.execPath, [binPath, 'inspect'], { cwd: dir });

  expect(code === 1, `exited ${code}, expected 1\n${output}`);
  expect(output.includes('undeclared-folder'), 'the report never names the finding');

  return 'code 1, names undeclared-folder';
});

await check('a packed install parses TS and Vue dynamic imports with its own dependencies', () => {
  const packDir = tempDir('bp-dist-pack-');
  const fixture = tempDir('bp-dist-installed-');
  const packed = runNpm(['pack', '--json', '--pack-destination', packDir], { cwd: root });

  expect(packed.code === 0, `npm pack exited ${packed.code}\n${packed.output}`);

  const jsonStart = packed.output.indexOf('[');
  const jsonEnd = packed.output.lastIndexOf(']') + 1;
  const packResult = JSON.parse(packed.output.slice(jsonStart, jsonEnd));
  const tarball = path.join(packDir, packResult[0].filename);

  const manifest = {
    name: 'installed-fixture',
    private: true,
    type: 'module',
    dependencies: { '@kekkai/blueprint': `file:${tarball}`, eslint: '^9.39.2' },
  };

  fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify(manifest));

  const installed = runNpm(
    ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: fixture },
  );

  expect(installed.code === 0, `npm install exited ${installed.code}\n${installed.output}`);

  fs.writeFileSync(
    path.join(fixture, 'blueprint.config.mjs'),
    [
      'import { defineBlueprint } from \'@kekkai/blueprint\';',
      'export default defineBlueprint({',
      '  framework: \'vue\',',
      '  architecture: {',
      '    alias: \'~app\',',
      '    additionalAliases: { \'~root\': \'.\' },',
      '    module: { layout: \'flat\', entry: \'index\', private: [\'hooks\'] },',
      '    layers: [{ name: \'pages\', does: \'routes\', module: { layout: \'folder\' } },',
      '      { name: \'services\', does: \'I/O\' }],',
      '  },',
      '});',
      '',
    ].join('\n'),
  );

  fs.mkdirSync(path.join(fixture, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(fixture, 'src', 'services'), { recursive: true });

  fs.writeFileSync(
    path.join(fixture, 'src', 'pages', 'page.ts'),
    [
      'const prefix = \'~root/src/\';',
      'void import(prefix + \'services/api\');',
      'void import(globalThis.runtimeTarget);',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(fixture, 'src', 'pages', 'view.vue'),
    [
      '<script setup lang="ts">',
      'const unit = \'api\';',
      'void import(`~app/services/${unit}`);',
      '</script>',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(path.join(fixture, 'src', 'services', 'api.ts'), 'export const api = 1;\n');

  const upgrade = runNpm(
    ['exec', '--', 'blueprint', 'init', '--no-install'], { cwd: fixture },
  );

  const result = runNpm(['exec', '--', 'blueprint', 'inspect'], { cwd: fixture });

  expect(upgrade.code === 0, `installed legacy init exited ${upgrade.code}\n${upgrade.output}`);

  expect(upgrade.output.includes('migrated to valid 4.0 layer-first'),
    'installed defineBlueprint config did not enter legacy migration');

  expect(result.code === 1, `installed inspect exited ${result.code}, expected 1\n${result.output}`);
  expect(result.output.includes('canonical-alias'), 'installed inspect missed the alternate alias');

  expect(
    result.output.includes('1 runtime-dependent dynamic import(s)'),
    'installed inspect did not disclose the runtime-dependent target',
  );

  fs.rmSync(path.join(fixture, 'src'), { recursive: true, force: true });
  fs.mkdirSync(path.join(fixture, 'src', 'components'), { recursive: true });

  fs.writeFileSync(
    path.join(fixture, 'blueprint.config.mjs'),
    'export default { framework: \'react\', architecture: { alias: \'~app\', '
    + 'layers: [{ name: \'components\', does: \'UI\' }] }, rules: {} };\n',
  );

  fs.writeFileSync(
    path.join(fixture, 'eslint.config.mjs'),
    [
      'import { emitLint } from \'@kekkai/blueprint\';',
      'import blueprint from \'./blueprint.config.mjs\';',
      'export default [{ files: [\'**/*.js\'], rules: { \'no-debugger\': \'error\' } },',
      '  ...emitLint(blueprint)];',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(fixture, 'jsconfig.json'),
    JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
  );

  const fixturePackage = JSON.parse(fs.readFileSync(path.join(fixture, 'package.json')));

  fixturePackage.scripts = { lint: 'eslint src --max-warnings=0' };
  fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify(fixturePackage));

  const source = path.join(fixture, 'src', 'components', 'x.js');

  fs.writeFileSync(source, 'export const x = 1;\n');
  const greenDoctor = runNpm(['exec', '--', 'blueprint', 'doctor'], { cwd: fixture });

  expect(greenDoctor.code === 0, `installed doctor green exited ${greenDoctor.code}\n${greenDoctor.output}`);
  expect(greenDoctor.output.includes('all 9 checks passed'), 'installed doctor did not complete');

  fs.writeFileSync(source, 'debugger;\n');
  const beforeDoctor = snapshotProductTree(fixture);
  const redDoctor = runNpm(['exec', '--', 'blueprint', 'doctor'], { cwd: fixture });
  const jsonDoctor = runNpm(['exec', '--', 'blueprint', 'doctor', '--json'], { cwd: fixture });

  expect(redDoctor.code === 1, `installed doctor red exited ${redDoctor.code}\n${redDoctor.output}`);

  expect(redDoctor.output.includes('✗ reachable eslint leg passes live'),
    'installed doctor missed real eslint debt');

  expect(jsonDoctor.code === 1, `installed JSON doctor exited ${jsonDoctor.code}`);

  expect(jsonDoctor.output.includes('"verdict": "incomplete"'),
    'installed JSON doctor disagreed with text/exit');

  expect(snapshotProductTree(fixture) === beforeDoctor, 'installed doctor changed project bytes');

  return 'packed dependency tree, TS + Vue parsed, doctor live lint verified';
});

await check('`init --dry-run` plans against a real fixture and writes nothing', () => {
  // The full runtime path — detect, resolve, plan — driven through the bundle
  // rather than through an import, on a repo it has never seen.
  const dir = tempDir('bp-dist-init-');

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies: { vue: '^3' } }),
  );

  const before = fs.readdirSync(dir).sort();

  const { code, output } = runCmd(
    process.execPath,
    [binPath, 'init', '--topology', 'layer-first', '--dry-run', '--no-install'],
    { cwd: dir },
  );

  expect(code === 0, `exited ${code}\n${output}`);
  expect(output.includes('blueprint.config.mjs'), 'the plan never mentions the config it would write');

  expect(
    JSON.stringify(fs.readdirSync(dir).sort()) === JSON.stringify(before),
    `--dry-run touched the filesystem: ${fs.readdirSync(dir).sort().join(', ')}`,
  );

  return 'code 0, tree unchanged';
});

await check('built init accepts both explicit topologies on empty fixtures', () => {
  const layerFirst = tempDir('bp-dist-topology-layer-');
  const moduleFirst = tempDir('bp-dist-topology-module-');

  writeReactFixture(layerFirst);
  writeReactFixture(moduleFirst);

  const layer = runCmd(
    process.execPath,
    [binPath, 'init', '--topology', 'layer-first', '--no-install'],
    { cwd: layerFirst },
  );

  const module = runCmd(
    process.execPath,
    [binPath, 'init', '--topology', 'module-first', '--no-install'],
    { cwd: moduleFirst },
  );

  expect(layer.code === 0, `layer-first exited ${layer.code}\n${layer.output}`);
  expect(module.code === 0, `module-first exited ${module.code}\n${module.output}`);
  expect(!module.output.includes('brownfield without a config'), 'module path called itself brownfield');
  expect(!module.output.includes('Prefer a preset scaffold'), 'module path recommends a preset');
  expect(!module.output.includes('init --preset --topology layer-first'), 'module path recommends LF');
  expect(fs.existsSync(path.join(layerFirst, 'blueprint.config.mjs')), 'layer config missing');
  expect(fs.existsSync(path.join(moduleFirst, 'blueprint-authoring.md')), 'module playbook missing');
  expect(!fs.existsSync(path.join(moduleFirst, 'blueprint.config.mjs')), 'module path guessed a config');

  const playbook = fs.readFileSync(path.join(moduleFirst, 'blueprint-authoring.md'), 'utf-8');

  expect(playbook.includes('module-first was selected'), 'module target was lost in authoring');

  expect(
    playbook.includes('ordinary top-level folders below `sourceRoot` as module'),
    'module method does not classify top-level folders as module candidates',
  );

  expect(
    playbook.includes('technical layers that repeat inside ordinary modules'),
    'module method does not derive repeated inner layers',
  );

  expect(playbook.includes('Infer direct `dependsOn` edges'), 'module dependencies are omitted');
  expect(playbook.includes('module + inner-layer structure'), 'module report contract is omitted');

  expect(
    playbook.includes('{ name: \'app\', does: \'router composition\', dependsOn:'),
    'module schema does not declare the reserved app container',
  );

  expect(
    playbook.includes('governed recursively without repeating the shared inner layers'),
    'module schema does not explain app container semantics',
  );

  expect(!playbook.includes('early-exit checklist'), 'module authoring recommends layer-first exit');

  expect(
    !playbook.includes('Top-level folders under `src/` are candidates for layers'),
    'module authoring retained layer-first classification',
  );

  expect(
    !playbook.includes('preset\'s declared-but-empty layers'),
    'module authoring retained the preset runway',
  );

  expect(!playbook.includes('Optional module-first topology'), 'module schema calls itself optional');

  expect(
    !playbook.includes('intentionally absent from `modules`'),
    'module schema leaves app outside the governed module set',
  );

  return 'layer scaffold + module authoring';
});

await check('built init rejects malformed topology flags before every write', () => {
  const cases = [
    ['--topology'],
    ['--topology', 'sideways'],
    ['--topology', 'layer-first', '--topology', 'module-first'],
  ];

  for (const args of cases) {
    const dir = tempDir('bp-dist-topology-invalid-');

    writeReactFixture(dir);
    const before = snapshotTree(dir);
    const result = runCmd(process.execPath, [binPath, 'init', ...args], { cwd: dir });

    expect(result.code === 1, `${args.join(' ')} exited ${result.code}`);
    expect(snapshotTree(dir) === before, `${args.join(' ')} changed the fixture`);
  }

  return `${cases.length} invalid forms, byte-identical trees`;
});

await check('built init accepts an explicit configured topology', () => {
  const dir = tempDir('bp-dist-topology-same-');

  writeReactFixture(dir);

  fs.writeFileSync(
    path.join(dir, 'blueprint.config.mjs'),
    'export default { framework: \'react\', architecture: { alias: \'~app\', '
    + 'layers: [{ name: \'pages\', does: \'routes\' }] } };\n',
  );

  const result = runCmd(
    process.execPath,
    [binPath, 'init', '--topology', 'layer-first', '--dry-run', '--no-install'],
    { cwd: dir },
  );

  expect(result.code === 0, `same topology exited ${result.code}\n${result.output}`);

  return 'configured layer-first repaired';
});

await check('built init upgrades true 3.2 configs before an explicit topology change', () => {
  const normal = tempDir('bp-dist-legacy-normal-');
  const explicit = tempDir('bp-dist-legacy-explicit-');
  const explicitSibling = path.join(explicit, 'apps', 'admin');
  const mixed = tempDir('bp-dist-legacy-mixed-');

  const legacyConfig = 'export default { framework: \'react\', architecture: {'
    + ' alias: \'~app\', module: { layout: \'folder\', entry: \'index\','
    + ' private: [\'hooks\'] }, layers: [{ name: \'pages\', does: \'routes\' },'
    + ' { name: \'components\', does: \'UI\', module: { layout: \'flat\','
    + ' entry: \'component\' } }] } };\n';

  for (const dir of [normal, explicit, mixed]) {
    writeReactFixture(dir);
    fs.writeFileSync(path.join(dir, 'blueprint.config.mjs'), legacyConfig);
  }

  fs.mkdirSync(explicitSibling, { recursive: true });
  writeReactFixture(explicitSibling);
  fs.writeFileSync(path.join(explicitSibling, 'blueprint.config.mjs'), legacyConfig);

  fs.writeFileSync(
    path.join(mixed, 'blueprint.config.mjs'),
    legacyConfig.replace('alias: \'~app\',', 'alias: \'~app\', modules: [{ name: \'auth\', does: \'auth\' }],'),
  );

  for (const [dir, target] of [
    [normal, []],
    [explicit, ['--topology', 'module-first']],
  ]) {
    const before = snapshotTree(dir);

    const dry = runCmd(
      process.execPath, [binPath, 'init', ...target, '--dry-run', '--no-install'], { cwd: dir },
    );

    expect(dry.code === 0, `legacy dry run exited ${dry.code}\n${dry.output}`);

    expect(dry.output.includes('to valid 4.0 layer-first'),
      'legacy dry run claimed no prospective migration');

    expect(snapshotTree(dir) === before, 'legacy dry run changed the fixture');
  }

  const mixedResult = runCmd(
    process.execPath, [binPath, 'init', '--no-install'], { cwd: mixed },
  );

  expect(mixedResult.code === 1, `mixed config exited ${mixedResult.code}`);

  expect(mixedResult.output.includes('architecture.module is retired in Blueprint 4.0'),
    'mixed config bypassed strict 4.0 validation');

  expect(!mixedResult.output.includes('transformation preflight'),
    'mixed config was misrouted into a topology transformation');

  const normalUpgrade = runCmd(
    process.execPath, [binPath, 'init', '--no-install'], { cwd: normal },
  );

  const normalControl = runCmd(
    process.execPath, [binPath, 'init', '--no-install'], { cwd: normal },
  );

  expect(normalUpgrade.code === 0, `normal upgrade exited ${normalUpgrade.code}\n${normalUpgrade.output}`);
  expect(normalControl.code === 0, `normal control exited ${normalControl.code}\n${normalControl.output}`);

  expect(!fs.readFileSync(path.join(normal, 'blueprint.config.mjs'), 'utf-8').includes('"module"'),
    'normal upgrade retained the retired module field');

  const repository = tempDir('bp-dist-legacy-repository-');
  const web = path.join(repository, 'apps', 'web');
  const admin = path.join(repository, 'apps', 'admin');

  fs.mkdirSync(web, { recursive: true });
  fs.mkdirSync(admin, { recursive: true });

  fs.writeFileSync(path.join(repository, 'package.json'),
    JSON.stringify({ name: 'repository', private: true, workspaces: ['apps/*'] }));

  fs.writeFileSync(path.join(repository, 'package-lock.json'), '{}');

  for (const application of [web, admin]) {
    writeReactFixture(application);
    fs.writeFileSync(path.join(application, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(application, 'blueprint.config.mjs'), legacyConfig);
  }

  for (const args of [
    ['init', '--quiet'],
    ['add', '.'],
    ['-c', 'user.name=Blueprint Dist', '-c', 'user.email=dist@example.invalid',
      'commit', '--quiet', '-m', 'legacy repository'],
  ]) {
    const git = runCmd('git', args, { cwd: repository });

    expect(git.code === 0, `git ${args.join(' ')} failed\n${git.output}`);
  }

  const webUpgrade = runCmd(
    process.execPath, [binPath, 'init', '--no-install'], { cwd: web },
  );

  const adminUpgrade = runCmd(
    process.execPath, [binPath, 'init', '--no-install'], { cwd: admin },
  );

  expect(webUpgrade.code === 0, `sibling scan blocked web upgrade\n${webUpgrade.output}`);
  expect(adminUpgrade.code === 0, `sibling scan blocked admin upgrade\n${adminUpgrade.output}`);

  for (const args of [
    ['init', '--quiet'],
    ['add', '.'],
    ['-c', 'user.name=Blueprint Dist', '-c', 'user.email=dist@example.invalid',
      'commit', '--quiet', '-m', '3.2 baseline'],
  ]) {
    const git = runCmd('git', args, { cwd: explicit });

    expect(git.code === 0, `git ${args.join(' ')} failed\n${git.output}`);
  }

  const beforePresetRefusal = snapshotTree(explicit);

  const presetRefusal = runCmd(
    process.execPath,
    [binPath, 'init', '--topology', 'module-first', '--preset', '--no-install'],
    { cwd: explicit },
  );

  expect(presetRefusal.code === 1, `legacy preset refusal exited ${presetRefusal.code}`);

  expect(presetRefusal.output.includes('No files were changed'),
    'legacy preset refusal omitted the zero-write guarantee');

  expect(snapshotTree(explicit) === beforePresetRefusal,
    'legacy preset refusal wrote a repository checkpoint');

  const phaseOne = runCmd(
    process.execPath,
    [binPath, 'init', '--topology', 'module-first', '--no-install'],
    { cwd: explicit },
  );

  expect(phaseOne.code === 0, `phase 1 exited ${phaseOne.code}\n${phaseOne.output}`);
  expect(phaseOne.output.includes('Blueprint 3.2 phase 1'), 'phase 1 guidance missing');

  expect(phaseOne.output.includes('all 2 Blueprint configs in the repository'),
    'phase 1 did not report the repository-wide checkpoint');

  for (const application of [explicit, explicitSibling]) {
    expect(!fs.readFileSync(path.join(application, 'blueprint.config.mjs'), 'utf-8')
      .includes('"module"'), `phase 1 retained a sibling 3.2 config in ${application}`);
  }

  expect(!fs.existsSync(path.join(explicit, 'blueprint-authoring.md')),
    'phase 1 entered transformation before establishing 4.0 layer-first');

  const add = runCmd('git', ['add', '.'], { cwd: explicit });

  const commit = runCmd(
    'git',
    ['-c', 'user.name=Blueprint Dist', '-c', 'user.email=dist@example.invalid',
      'commit', '--quiet', '-m', '4.0 layer-first'],
    { cwd: explicit },
  );

  expect(add.code === 0, `git add failed\n${add.output}`);
  expect(commit.code === 0, `phase 1 commit failed\n${commit.output}`);

  const transformation = runCmd(
    process.execPath,
    [binPath, 'init', '--topology', 'module-first', '--no-install'],
    { cwd: explicit },
  );

  expect(transformation.code === 0,
    `phase 2 exited ${transformation.code}\n${transformation.output}`);

  expect(fs.readFileSync(path.join(explicit, 'blueprint-authoring.md'), 'utf-8')
    .includes('Phase 1 — prove the 4.0 layer-first state before movement'),
  'phase 2 did not open the guarded transformation playbook');

  return 'normal LF positive control + explicit MF two-phase positive control';
});

await check('built init opens the guarded layer-first to module-first playbook', () => {
  const dir = tempDir('bp-dist-topology-transform-');

  writeReactFixture(dir);

  fs.writeFileSync(
    path.join(dir, 'blueprint.config.mjs'),
    'export default { framework: \'react\', architecture: { alias: \'~app\', '
    + 'layers: [{ name: \'pages\', does: \'routes\' }, '
    + '{ name: \'components\', does: \'UI\' }] } };\n',
  );

  fs.mkdirSync(path.join(dir, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'components'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'pages', 'Home.ts'), 'export const Home = 1;\n');
  fs.writeFileSync(path.join(dir, 'src', 'components', 'Button.ts'), 'export const Button = 1;\n');

  for (const args of [
    ['init', '--quiet'],
    ['add', '.'],
    ['-c', 'user.name=Blueprint Dist', '-c', 'user.email=dist@example.invalid',
      'commit', '--quiet', '-m', 'baseline'],
  ]) {
    const git = runCmd('git', args, { cwd: dir });

    expect(git.code === 0, `git ${args.join(' ')} failed\n${git.output}`);
  }

  const result = runCmd(
    process.execPath,
    [binPath, 'init', '--topology', 'module-first', '--no-install'],
    { cwd: dir },
  );

  const playbook = fs.readFileSync(path.join(dir, 'blueprint-authoring.md'), 'utf-8');

  expect(result.code === 0, `transformation exited ${result.code}\n${result.output}`);
  expect(result.output.includes('Git preflight passed'), 'built path skipped transformation preflight');
  expect(playbook.includes('Current topology: `layer-first`'), 'playbook lost current topology');
  expect(playbook.includes('Target topology: `module-first`'), 'playbook lost target topology');
  expect(playbook.includes('git mv'), 'playbook omitted tracked movement responsibility');

  return 'clean committed Git → measured Agent transformation playbook';
});

await check('built init opens the guarded module-first to layer-first playbook', () => {
  const dir = tempDir('bp-dist-topology-change-');

  writeReactFixture(dir);

  fs.writeFileSync(
    path.join(dir, 'blueprint.config.mjs'),
    'export default { framework: \'react\', architecture: { alias: \'~app\', '
    + 'modules: [{ name: \'auth\', does: \'authentication\' }], '
    + 'layers: [{ name: \'hooks\', does: \'state\' }] } };\n',
  );

  fs.mkdirSync(path.join(dir, 'src', 'auth', 'hooks'), { recursive: true });

  fs.writeFileSync(
    path.join(dir, 'src', 'auth', 'hooks', 'useAuth.ts'),
    'export const useAuth = 1;\n',
  );

  for (const args of [
    ['init', '--quiet'],
    ['add', '.'],
    ['-c', 'user.name=Blueprint Dist', '-c', 'user.email=dist@example.invalid',
      'commit', '--quiet', '-m', 'baseline'],
  ]) {
    const git = runCmd('git', args, { cwd: dir });

    expect(git.code === 0, `git ${args.join(' ')} failed\n${git.output}`);
  }

  const result = runCmd(
    process.execPath,
    [binPath, 'init', '--topology', 'layer-first', '--authoring', '--no-install'],
    { cwd: dir },
  );

  const playbook = fs.readFileSync(path.join(dir, 'blueprint-authoring.md'), 'utf-8');

  expect(result.code === 0, `topology change exited ${result.code}\n${result.output}`);
  expect(result.output.includes('Git preflight passed'), 'reverse path skipped preflight');
  expect(playbook.includes('Current topology: `module-first`'), 'playbook lost current topology');
  expect(playbook.includes('Target topology: `layer-first`'), 'playbook lost target topology');

  expect(playbook.includes('src/auth/hooks/useAuth.ts` → `src/hooks/useAuth.ts'),
    'playbook lost structural destination');

  return 'clean committed Git → measured reverse Agent transformation playbook';
});

await check('built preset never infers topology from a module-shaped tree', () => {
  const dir = tempDir('bp-dist-topology-inferred-module-');

  writeReactFixture(dir);
  fs.mkdirSync(path.join(dir, 'src', 'auth', 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'checkout', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'auth', 'hooks', 'auth.ts'), 'export const auth = 1;\n');

  fs.writeFileSync(
    path.join(dir, 'src', 'checkout', 'hooks', 'checkout.ts'),
    'export const checkout = 1;\n',
  );

  const before = snapshotTree(dir);

  const result = runCmd(
    process.execPath,
    [binPath, 'init', '--preset', '--no-install'],
    { cwd: dir },
  );

  expect(result.code === 1, `unmanaged module-shaped tree exited ${result.code}\n${result.output}`);

  expect(result.output.includes('no authoritative Blueprint topology'),
    'failure does not name the missing authority');

  expect(snapshotTree(dir) === before, 'preset wrote over the unmanaged module-shaped tree');

  return 'code 1, byte-identical tree';
});

await check('built preset requires explicit LF on first adoption and rejects explicit MF', () => {
  const unmanaged = tempDir('bp-dist-preset-unmanaged-layer-');
  const explicit = tempDir('bp-dist-preset-explicit-layer-');
  const conflict = tempDir('bp-dist-preset-explicit-module-');

  for (const dir of [unmanaged, explicit, conflict]) writeReactFixture(dir);

  fs.mkdirSync(path.join(unmanaged, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(unmanaged, 'src', 'components'), { recursive: true });
  fs.writeFileSync(path.join(unmanaged, 'src', 'pages', 'Home.tsx'), 'export const Home = 1;\n');

  fs.writeFileSync(
    path.join(unmanaged, 'src', 'components', 'Button.tsx'),
    'export const Button = 1;\n',
  );

  const beforeUnmanaged = snapshotTree(unmanaged);

  const unmanagedResult = runCmd(
    process.execPath, [binPath, 'init', '--preset', '--no-install'], { cwd: unmanaged },
  );

  const explicitResult = runCmd(
    process.execPath,
    [binPath, 'init', '--topology', 'layer-first', '--preset', '--no-install'],
    { cwd: explicit },
  );

  const beforeConflict = snapshotTree(conflict);

  const conflictResult = runCmd(
    process.execPath,
    [binPath, 'init', '--topology', 'module-first', '--preset', '--no-install'],
    { cwd: conflict },
  );

  expect(unmanagedResult.code === 1, `unmanaged LF exited ${unmanagedResult.code}`);
  expect(snapshotTree(unmanaged) === beforeUnmanaged, 'unmanaged preset changed the tree');
  expect(explicitResult.code === 0, `explicit LF exited ${explicitResult.code}`);
  expect(conflictResult.code === 1, `explicit MF exited ${conflictResult.code}`);
  expect(snapshotTree(conflict) === beforeConflict, 'explicit MF preset conflict changed the tree');

  return 'unmanaged preset aborts; explicit LF passes; explicit MF aborts unchanged';
});

// -------------------------------------------- the bin through an npm-style link

if (process.platform === 'win32') {
  // Not skipped for convenience — the scenario does not exist here. npm on
  // Windows writes `.cmd` / `.ps1` shims into node_modules\.bin instead of
  // symlinks, so `argv[1]` is the real bin path and the guard has nothing to see
  // through. (Creating a file symlink on Windows also needs a privilege the
  // runner does not have.) The posix leg of the matrix covers the guard.
  console.log('  · the npm-style symlink check does not apply on win32 — npm writes'
    + ' .cmd shims here, so argv[1] is already the real path (covered on the posix leg)');
} else {
  await check('the bin still runs through an npm-style symlink', () => {
    // npm installs the bin as a symlink into node_modules/.bin. Node resolves the
    // entry module to its real path while argv[1] keeps the link path, so an
    // entry-point guard comparing the two without realpathSync never fires and
    // the CLI exits 0 having done nothing — shipped once, as 0.1.1.
    const dir = tempDir('bp-dist-link-');
    const binDir = path.join(dir, 'node_modules', '.bin');

    fs.mkdirSync(binDir, { recursive: true });

    const link = path.join(binDir, 'blueprint');

    fs.symlinkSync(binPath, link);
    // npm sets the mode on install; the built file is 644 until it is packed.
    fs.chmodSync(binPath, 0o755);

    const { code, output } = runCmd(link, ['--version'], { cwd: dir });

    expect(code === 0, `exited ${code}\n${output}`);

    expect(
      output.includes(pkg.version),
      `printed ${JSON.stringify(output.trim())} — the entry guard did not fire through the symlink`,
    );

    return `via ${path.relative(dir, link)}`;
  });
}

// ------------------------------------------------------------- the package entry

await check('the package entry imports and exports its public surface', async () => {
  const entry = pkg.exports?.['.']?.import;

  expect(entry, 'package.json declares no exports["."].import');

  // Through pathToFileURL, not the bare path: on Windows an absolute path starts
  // with a drive letter, and the ESM loader reads `D:` as a URL scheme it does not
  // support. The mirror of the `url.pathname` mistake fixed in cli.test.ts — one
  // treated a URL as a path, this treated a path as a URL, and neither shows on
  // posix where the two happen to coincide.
  const module = await import(pathToFileURL(path.join(root, entry)).href);

  // The names an adopter's blueprint.config.mjs and eslint.config.mjs reach for.
  const required = ['defineBlueprint', 'emitLint', 'emitHandbook', 'emitAgentFiles', 'plugin'];
  const missing = required.filter((name) => typeof module[name] === 'undefined');

  expect(!missing.length, `missing from the entry: ${missing.join(', ')}`);

  return `${Object.keys(module).length} exports`;
});

await check('the declared types file exists', () => {
  const types = pkg.exports?.['.']?.types;

  expect(types, 'package.json declares no exports["."].types');
  expect(fs.existsSync(path.join(root, types)), `${types} was not emitted`);

  return types;
});

// ------------------------------------------------------------------------- done

for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.log(`\n✗ ${failures.length} of the artifact checks failed.`);
  process.exit(1);
}

console.log('\n✓ the built artifact behaves as a consumer would meet it.');
