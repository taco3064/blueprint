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
    dependencies: { '@kekkai/blueprint': `file:${tarball}` },
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
      '    layers: [{ name: \'pages\', does: \'routes\' }, { name: \'services\', does: \'I/O\' }],',
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

  const result = runNpm(['exec', '--', 'blueprint', 'inspect'], { cwd: fixture });

  expect(result.code === 1, `installed inspect exited ${result.code}, expected 1\n${result.output}`);
  expect(result.output.includes('canonical-alias'), 'installed inspect missed the alternate alias');

  expect(
    result.output.includes('1 runtime-dependent dynamic import(s)'),
    'installed inspect did not disclose the runtime-dependent target',
  );

  return 'packed dependency tree, TS + Vue parsed';
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

await check('built init refuses an unavailable topology transformation without writes', () => {
  const dir = tempDir('bp-dist-topology-change-');

  writeReactFixture(dir);

  fs.writeFileSync(
    path.join(dir, 'blueprint.config.mjs'),
    'export default { framework: \'react\', architecture: { alias: \'~app\', '
    + 'modules: [{ name: \'auth\', does: \'authentication\' }], '
    + 'layers: [{ name: \'hooks\', does: \'state\' }] } };\n',
  );

  const before = snapshotTree(dir);

  const result = runCmd(
    process.execPath,
    [binPath, 'init', '--topology', 'layer-first', '--authoring', '--no-install'],
    { cwd: dir },
  );

  expect(result.code === 1, `topology change exited ${result.code}\n${result.output}`);
  expect(result.output.includes('transformation'), 'failure does not explain the unavailable path');
  expect(snapshotTree(dir) === before, 'unavailable transformation changed the fixture');

  return 'code 1, byte-identical tree';
});

await check('built preset treats inferred module-first as a layer-first transformation', () => {
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

  expect(result.code === 1, `inferred module-first exited ${result.code}\n${result.output}`);
  expect(result.output.includes('module-first to layer-first'), 'failure does not name direction');
  expect(snapshotTree(dir) === before, 'preset wrote over inferred module-first');

  return 'code 1, byte-identical tree';
});

await check('built preset covers inferred LF, explicit LF, and invalid explicit MF', () => {
  const inferred = tempDir('bp-dist-preset-inferred-layer-');
  const explicit = tempDir('bp-dist-preset-explicit-layer-');
  const conflict = tempDir('bp-dist-preset-explicit-module-');

  for (const dir of [inferred, explicit, conflict]) writeReactFixture(dir);

  fs.mkdirSync(path.join(inferred, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(inferred, 'src', 'components'), { recursive: true });
  fs.writeFileSync(path.join(inferred, 'src', 'pages', 'Home.tsx'), 'export const Home = 1;\n');

  fs.writeFileSync(
    path.join(inferred, 'src', 'components', 'Button.tsx'),
    'export const Button = 1;\n',
  );

  const inferredResult = runCmd(
    process.execPath, [binPath, 'init', '--preset', '--no-install'], { cwd: inferred },
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

  expect(inferredResult.code === 0, `inferred LF exited ${inferredResult.code}`);
  expect(explicitResult.code === 0, `explicit LF exited ${explicitResult.code}`);
  expect(conflictResult.code === 1, `explicit MF exited ${conflictResult.code}`);
  expect(snapshotTree(conflict) === beforeConflict, 'explicit MF preset conflict changed the tree');

  return 'inferred LF + explicit LF pass; explicit MF aborts unchanged';
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
