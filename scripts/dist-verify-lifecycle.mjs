/**
 * Lifecycle checks for `dist-verify.mjs`: the packed artifact must ship the upgrade catalog,
 * install and hand off to the target it runs as, keep lifecycle completion behind verification,
 * and reverse a built `init` with `remove`. The in-process suites inject every effect; only a
 * built bin proves the handoff, the tarball install spec, and the bundled catalog.
 */
import fs from 'node:fs';
import path from 'node:path';

const LEGACY_CONFIG = 'export default { framework: \'react\', architecture: {'
  + ' alias: \'~app\', module: { layout: \'folder\', entry: \'index\', private: [\'hooks\'] },'
  + ' layers: [{ name: \'pages\', does: \'routes\' }, { name: \'hooks\', does: \'state\' }] } };\n';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function legacyAdoption(dir, extraDevDependencies = {}) {
  writeJson(path.join(dir, 'package.json'), {
    name: 'legacy-fixture',
    private: true,
    dependencies: { react: '^19.0.0' },
    devDependencies: { '@kekkai/blueprint': '3.2.0', ...extraDevDependencies },
  });

  writeJson(path.join(dir, 'node_modules/@kekkai/blueprint/package.json'), {
    name: '@kekkai/blueprint', version: '3.2.0',
  });

  fs.writeFileSync(path.join(dir, 'blueprint.config.mjs'), LEGACY_CONFIG);
}

function commitAll(tools, dir) {
  const identity = ['-c', 'user.name=Blueprint Dist', '-c', 'user.email=dist@example.invalid'];

  for (const args of [['init', '-q'], ['add', '.'], [...identity, 'commit', '-qm', 'adopt']]) {
    const git = tools.runCmd('git', args, { cwd: dir });

    tools.expect(git.code === 0, `git ${args.join(' ')} exited ${git.code}\n${git.output}`);
  }
}

export async function verifyLifecycle(tools) {
  const { check, expect, runCmd, runNpm, tempDir, packedTarball, binPath, pkg } = tools;

  await check('built upgrade resolves a direct 3.2 jump from the shipped catalog without mutation', () => {
    const dir = tempDir('bp-dist-upgrade-plan-');

    legacyAdoption(dir);

    const before = tools.snapshotTree(dir);
    const dry = runCmd(process.execPath, [binPath, 'upgrade', '--dry-run'], { cwd: dir });

    expect(dry.code === 0, `upgrade --dry-run exited ${dry.code}\n${dry.output}`);

    for (const fragment of [
      'Source: 3.2.0 (installed @kekkai/blueprint; no lifecycle state yet',
      `Target: ${pkg.version}`,
      'legacy-unit-shape',
      'review-retired-module-private (4.0.0)',
      'Safety: ✗ starting an upgrade requires a Git worktree',
    ]) {
      expect(dry.output.includes(fragment), `dry run never said: ${fragment}\n${dry.output}`);
    }

    const refused = runCmd(process.execPath, [binPath, 'upgrade'], { cwd: dir });

    expect(refused.code === 1, `upgrade outside Git exited ${refused.code}\n${refused.output}`);
    expect(tools.snapshotTree(dir) === before, 'upgrade planning or refusal changed the fixture');

    return 'catalog resolved, nothing written';
  });

  await check('a packed upgrade installs its own tarball, hands off, and stays pending until verified', () => {
    const dir = tempDir('bp-dist-upgrade-apply-');
    const runner = tempDir('bp-dist-upgrade-runner-');

    legacyAdoption(dir, {
      eslint: '^9.39.2',
      '@eslint-community/eslint-plugin-eslint-comments': '^4.7.2',
      '@stylistic/eslint-plugin': '^5.10.0',
      'eslint-plugin-import-x': '^4.17.1',
    });

    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
    commitAll(tools, dir);

    const installed = runNpm(
      ['install', packedTarball(), '--ignore-scripts', '--no-audit', '--no-fund'],
      { cwd: runner },
    );

    expect(installed.code === 0, `runner install exited ${installed.code}\n${installed.output}`);

    const runnerBin = path.join(runner, 'node_modules/@kekkai/blueprint/dist/bin.js');
    const started = runCmd(process.execPath, [runnerBin, 'upgrade'], { cwd: dir });

    for (const fragment of [
      'npm install -D',
      'continuing with the project-installed @kekkai/blueprint',
      'Upgrade pending — 1 semantic operation(s) need the coding Agent',
    ]) {
      expect(started.output.includes(fragment), `upgrade never said: ${fragment}\n${started.output}`);
    }

    expect(started.code === 1, `pending upgrade exited ${started.code}\n${started.output}`);

    expect(readJson(path.join(dir, 'node_modules/@kekkai/blueprint/package.json')).version === pkg.version,
      'the project did not end on the running target');

    const state = readJson(path.join(dir, '.blueprint-lifecycle.json'));

    expect(state.blueprint === '3.2.0' && state.pending?.to === pkg.version,
      `lifecycle moved before verification: ${JSON.stringify(state)}`);

    expect(fs.readFileSync(path.join(dir, 'blueprint-upgrade.md'), 'utf-8')
      .includes('review-retired-module-private'), 'the resolved playbook lost its operation');

    const localBin = path.join(dir, 'node_modules/@kekkai/blueprint/dist/bin.js');

    for (const backup of fs.readdirSync(dir).filter((name) => name.includes('.pre-v4-'))) {
      fs.rmSync(path.join(dir, backup));
    }

    const completed = runCmd(process.execPath,
      [localBin, 'upgrade', '--complete', 'review-retired-module-private'], { cwd: dir });

    expect(completed.code === 0, `--complete exited ${completed.code}\n${completed.output}`);

    const manifest = readJson(path.join(dir, 'package.json'));

    writeJson(path.join(dir, 'package.json'), {
      ...manifest,
      scripts: { ...manifest.scripts, lint: 'oxlint' },
    });

    const verified = runCmd(process.execPath, [localBin, 'upgrade'], { cwd: dir });

    expect(verified.code === 1 && verified.output.includes('verification did not pass'),
      `an unverified adoption completed the upgrade (${verified.code})\n${verified.output}`);

    expect(readJson(path.join(dir, '.blueprint-lifecycle.json')).blueprint === '3.2.0',
      'the lifecycle checkpoint moved although doctor did not pass');

    return `3.2.0 → ${pkg.version} pending until doctor passes`;
  });

  await check('built remove reverses a built init and keeps every pre-existing file', () => {
    const dir = tempDir('bp-dist-remove-');

    writeJson(path.join(dir, 'package.json'), { name: 'fixture', dependencies: { react: '^19' } });
    fs.writeFileSync(path.join(dir, '.gitignore'), 'docs/\n');

    const before = JSON.parse(tools.snapshotProductTree(dir));
    const init = runCmd(process.execPath, [binPath, 'init', '--topology', 'layer-first', '--no-install'], { cwd: dir });

    expect(init.code === 0, `init exited ${init.code}\n${init.output}`);

    fs.mkdirSync(path.join(dir, 'node_modules/@kekkai'), { recursive: true });
    fs.symlinkSync(tools.root, path.join(dir, 'node_modules/@kekkai/blueprint'), 'junction');

    const removed = runCmd(process.execPath, [binPath, 'remove'], { cwd: dir });

    expect(removed.code === 0, `remove exited ${removed.code}\n${removed.output}`);

    const after = JSON.parse(tools.snapshotProductTree(dir));
    const decode = (value) => Buffer.from(value, 'base64').toString('utf-8');

    expect(JSON.stringify(JSON.parse(decode(after['package.json'])))
      === JSON.stringify(JSON.parse(decode(before['package.json']))), 'package.json changed');

    delete after['package.json'];
    delete before['package.json'];

    expect(JSON.stringify(after) === JSON.stringify(before),
      `remove left or changed files: ${Object.keys(after).join(', ')}\n${removed.output}`);

    return 'init → remove round trip';
  });
}
