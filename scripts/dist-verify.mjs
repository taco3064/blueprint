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

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  temps.push(dir);

  return dir;
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

  expect(code === 0, `exited ${code}`);
  expect(output.includes('Architecture as Code'), 'usage banner missing from the output');

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

await check('`init --dry-run` plans against a real fixture and writes nothing', () => {
  // The full runtime path — detect, resolve, plan — driven through the bundle
  // rather than through an import, on a repo it has never seen.
  const dir = tempDir('bp-dist-init-');

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies: { vue: '^3' } }),
  );

  const before = fs.readdirSync(dir).sort();

  const { code, output } = runCmd(process.execPath, [binPath, 'init', '--dry-run', '--no-install'], {
    cwd: dir,
  });

  expect(code === 0, `exited ${code}\n${output}`);
  expect(output.includes('blueprint.config.mjs'), 'the plan never mentions the config it would write');

  expect(
    JSON.stringify(fs.readdirSync(dir).sort()) === JSON.stringify(before),
    `--dry-run touched the filesystem: ${fs.readdirSync(dir).sort().join(', ')}`,
  );

  return 'code 0, tree unchanged';
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

// ------------------------------------------------------- zero runtime dependencies

await check('package.json declares no runtime dependency', () => {
  // README's front page says "zero runtime dependencies". `minimatch` and `ignore`
  // are devDependencies rolldown inlines, and the whole arrangement rests on them
  // staying on that side of the line — moving either one here is a one-word edit
  // that makes the front page false with nothing else going red.
  const runtime = ['dependencies', 'peerDependencies']
    .flatMap((field) => Object.keys(pkg[field] ?? {}).map((name) => `${field}.${name}`));

  expect(!runtime.length, `declared and shipped to every adopter: ${runtime.join(', ')}`);

  return 'dependencies {}, peerDependencies {}';
});

await check('the bundle runs with no node_modules anywhere above it', async () => {
  // The other half of the same claim, and the half a package.json read cannot make:
  // an adopter installs this package with nothing beside it, so anything rolldown
  // left unbundled — `minimatch` and `ignore` above all — is a bare specifier Node
  // cannot resolve there, and the failure only exists after publishing. Copied out
  // of the repo on purpose: run in place, the repo's own node_modules resolves
  // every one of them and the check passes on a broken artifact.
  const dir = tempDir('bp-dist-isolated-');
  const ancestors = [];

  for (let at = dir; !ancestors.includes(at); at = path.dirname(at)) {
    ancestors.push(at);
  }

  const shadowing = ancestors.filter((at) => fs.existsSync(path.join(at, 'node_modules')));

  expect(
    !shadowing.length,
    `node_modules sits above the temp dir (${shadowing.join(', ')}), so an unbundled import`
    + ' would resolve there and this check would prove nothing',
  );

  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.copyFileSync(path.join(root, 'dist', 'index.js'), path.join(dir, 'index.js'));
  fs.copyFileSync(binPath, path.join(dir, 'bin.js'));

  // Both entries, because they are two rolldown builds with two `external` lists.
  await import(pathToFileURL(path.join(dir, 'index.js')).href);

  const { code, output } = runCmd(process.execPath, [path.join(dir, 'bin.js'), '--version'], {
    cwd: dir,
  });

  expect(code === 0, `the bin exited ${code} outside the repo\n${output}`);

  return 'index.js imported, bin.js ran';
});

// ------------------------------------------------------------------------- done

for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.log(`\n✗ ${failures.length} of the artifact checks failed.`);
  process.exit(1);
}

console.log('\n✓ the built artifact behaves as a consumer would meet it.');
