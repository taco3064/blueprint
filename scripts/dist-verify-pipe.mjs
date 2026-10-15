import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

export function verifyPipedOutput(bin) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-dist-pipe-'));

  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      name: 'pipe-consumer', type: 'module', dependencies: { react: '^18' },
    }));

    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), `export default ${JSON.stringify({
      framework: 'react',
      architecture: { alias: '~app', layers: [
        { name: 'domain', does: '檢查完整輸出🙂'.repeat(65536), layout: 'folder' },
      ] },
    })};\n`);

    const link = path.join(root, 'blueprint.mjs');

    fs.symlinkSync(bin, link);

    const invoke = (args, stdio) => {
      const result = spawnSync(process.execPath, [link, ...args], {
        cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
        timeout: 30000, ...(stdio ? { stdio } : {}),
      });

      if (result.error) throw result.error;
      assert.equal(result.signal, null);

      return result;
    };

    const inspect = (expected) => {
      const args = ['inspect', '--json'];
      const piped = invoke(args);
      const file = path.join(root, 'inspection.json');
      const descriptor = fs.openSync(file, 'w');
      let redirected;

      try {
        redirected = invoke(args, ['ignore', descriptor, 'pipe']);
      } finally {
        fs.closeSync(descriptor);
      }

      assert.equal(piped.status, expected);
      assert.equal(redirected.status, expected);
      assert.equal(piped.stderr, '');
      assert.equal(redirected.stderr, '');
      const complete = fs.readFileSync(file, 'utf8');

      assert.ok(Buffer.byteLength(complete) > 1024 * 1024);
      assert.equal(piped.stdout, complete);
      assert.equal(JSON.parse(piped.stdout).ok, expected === 0);
    };

    inspect(0);
    fs.mkdirSync(path.join(root, 'src', 'undeclared'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'undeclared', 'index.ts'), 'export const value = 1;\n');
    inspect(1);

    const flag = `--unknown-${'錯誤🙂'.repeat(7000)}`;
    const failed = invoke(['inspect', flag]);

    assert.equal(failed.status, 1);
    assert.equal(failed.stdout, '');
    assert.ok(Buffer.byteLength(failed.stderr) > 64 * 1024);
    assert.ok(failed.stderr.includes(flag));
    assert.ok(failed.stderr.endsWith('\n'));

    return 'symlinked bin: complete >1 MiB UTF-8 JSON at exits 0/1, complete large stderr at exit 1';
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
