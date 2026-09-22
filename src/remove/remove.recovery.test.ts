import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Blueprint } from '../config';
import type { GitReader } from '../project';
import { runRemove } from './remove';
import type { RemoveOptions } from './remove';

let root: string;
let lines: string[];

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-recovery-run-')));
  lines = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

const exists = (rel: string) => fs.existsSync(path.join(root, rel));
const output = () => lines.join('\n');

const BLUEPRINT: Blueprint = {
  framework: 'react',
  architecture: { alias: '~app', layers: [{ name: 'pages', does: 'routes' }] },
};

function state(): void {
  write('.blueprint-lifecycle.json', JSON.stringify({
    schema: 1, blueprint: '4.1.0', provenance: 'complete', operations: [], pending: null,
    applications: { '.': { provenance: [] } },
  }));
}

function arrange(): void {
  state();

  write('package.json', JSON.stringify({
    devDependencies: { '@kekkai/blueprint': '4.1.0' },
  }));

  write('blueprint.config.mjs', 'export default {};\n');
}

function remove(patch: Partial<RemoveOptions> = {}): Promise<number> {
  return runRemove(root, {
    log: (line) => void lines.push(line),
    loadConfig: async () => BLUEPRINT,
    exec: () => {},
    ...patch,
  });
}

describe('runRemove · successful post-uninstall recovery', () => {
  it('does not narrate recovery when uninstall leaves every target terminal', async () => {
    arrange();

    expect(await remove({ exec: () => write('package.json', '{}') })).toBe(0);

    expect(output()).not.toContain('Re-applying those actions once:');
    expect(exists('blueprint.config.mjs')).toBe(false);
    expect(exists('.blueprint-lifecycle.json')).toBe(false);
  });

  it('re-establishes an exact destructive target that reappears during uninstall', async () => {
    arrange();

    expect(await remove({
      exec: () => {
        write('package.json', '{}');
        write('blueprint.config.mjs', 'export default {};\n');
      },
    })).toBe(0);

    expect(output()).toContain('Re-applying those actions once:\n  ↻ blueprint.config.mjs');
    expect(exists('blueprint.config.mjs')).toBe(false);
    expect(exists('.blueprint-lifecycle.json')).toBe(false);
  });

  it('re-establishes exact config and lifecycle targets after uninstall', async () => {
    arrange();
    const lifecycle = fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf8');
    const commands: string[] = [];

    write('pnpm-lock.yaml', '');

    expect(await remove({
      exec: (command) => {
        commands.push(command);
        write('package.json', '{}');
        write('blueprint.config.mjs', 'export default {};\n');
        write('.blueprint-lifecycle.json', lifecycle);
      },
    })).toBe(0);

    expect(commands).toEqual(['pnpm remove @kekkai/blueprint']);
    expect(output()).toContain('↻ blueprint.config.mjs');
    expect(output()).toContain('↻ .blueprint-lifecycle.json');
    expect(exists('blueprint.config.mjs')).toBe(false);
    expect(exists('.blueprint-lifecycle.json')).toBe(false);
  });

  it('skips a recovery action whose target already reached its terminal state', async () => {
    arrange();

    expect(await remove({
      exec: () => {
        write('package.json', '{}');
        write('blueprint.config.mjs', 'export default {};\n');
      },
      log: (line) => {
        lines.push(line);

        if (line.includes('Re-applying those actions once:')) {
          fs.rmSync(path.join(root, 'blueprint.config.mjs'));
        }
      },
    })).toBe(0);

    expect(lines.filter((line) => line.includes('✓ delete blueprint.config.mjs'))).toHaveLength(1);
    expect(exists('blueprint.config.mjs')).toBe(false);
  });
});

describe('runRemove · recovery authority boundary', () => {
  it('keeps and reports an artifact that was absent from the original plan', async () => {
    arrange();
    const backup = `blueprint.config.mjs.pre-v4-${'a'.repeat(64)}`;

    expect(await remove({
      exec: () => {
        write('package.json', '{}');
        write(backup, 'new package-manager artifact\n');
      },
    })).toBe(1);

    expect(fs.readFileSync(path.join(root, backup), 'utf8'))
      .toBe('new package-manager artifact\n');

    expect(output()).toContain(`✗ ${backup}`);
  });

  it('keeps a lifecycle state that was absent from the original plan', async () => {
    write('package.json', JSON.stringify({
      devDependencies: { '@kekkai/blueprint': '4.1.0' },
    }));

    write('blueprint.config.mjs', 'export default {};\n');

    expect(await remove({
      exec: () => {
        write('package.json', '{}');
        state();
      },
    })).toBe(1);

    expect(exists('.blueprint-lifecycle.json')).toBe(true);
    expect(output()).toContain('✗ .blueprint-lifecycle.json');
  });
});

describe('runRemove · Git ref recovery', () => {
  it('re-establishes a transformation ref that reappears during uninstall', async () => {
    arrange();
    let refPresent = true;

    const git: GitReader = (args) => {
      if (args[0] === 'rev-parse') {
        return { status: 0, stdout: args[1] === '--show-toplevel' ? root : 'true', stderr: '' };
      }

      if (args[0] === 'update-ref') {
        refPresent = false;

        return { status: 0, stdout: '', stderr: '' };
      }

      const stdout = !refPresent
        ? ''
        : args[1] === '--format=%(refname)' ? `${args[2]}\n` : 'original-oid\n';

      return { status: 0, stdout, stderr: '' };
    };

    expect(await remove({
      git,
      exec: () => {
        write('package.json', '{}');
        refPresent = true;
      },
    })).toBe(0);

    expect(output()).toContain('↻ Git ref refs/blueprint/transformations/');
    expect(refPresent).toBe(false);
  });
});

describe('runRemove · divergent post-uninstall content', () => {
  it('keeps a divergent target that reappears during uninstall', async () => {
    arrange();
    const commands: string[] = [];

    await expect(remove({
      exec: (command) => {
        commands.push(command);
        write('package.json', '{}');
        write('blueprint.config.mjs', 'export default { userOwned: true };\n');
      },
    })).rejects.toThrow('blueprint.config.mjs changed after dependency uninstall');

    expect(fs.readFileSync(path.join(root, 'blueprint.config.mjs'), 'utf8'))
      .toBe('export default { userOwned: true };\n');

    expect(commands).toEqual(['npm uninstall @kekkai/blueprint']);
    expect(lines.filter((line) => line.includes('✓ delete blueprint.config.mjs'))).toHaveLength(1);
  });

  it('cleans an exact target and lists an adjacent divergent target', async () => {
    arrange();
    const commands: string[] = [];

    const failure = await remove({
      exec: (command) => {
        commands.push(command);
        write('package.json', '{}');
        write('blueprint.config.mjs', 'export default {};\n');
        write('.blueprint-lifecycle.json', '{"userOwned":true}\n');
      },
    }).then(() => null, (error: unknown) => error as Error);

    expect(failure?.message).toBe([
      'Blueprint remove stopped after dependency uninstall because re-materialized targets no '
      + 'longer match the exact state this removal plan authorized:',
      '  ✗ .blueprint-lifecycle.json changed after dependency uninstall',
      'Before stopping, recovery re-applied these originally authorized actions:',
      '  ✓ blueprint.config.mjs',
      'The divergent targets were kept and the plan was not widened. Review or remove the listed '
      + 'content manually.',
    ].join('\n'));

    expect(exists('blueprint.config.mjs')).toBe(false);

    expect(fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf8'))
      .toBe('{"userOwned":true}\n');

    expect(commands).toEqual(['npm uninstall @kekkai/blueprint']);
  });

  it('keeps content that diverges during recovery narration', async () => {
    arrange();

    await expect(remove({
      exec: () => {
        write('package.json', '{}');
        write('blueprint.config.mjs', 'export default {};\n');
      },
      log: (line) => {
        lines.push(line);

        if (line.includes('Re-applying those actions once:')) {
          write('blueprint.config.mjs', 'export default { userOwned: true };\n');
        }
      },
    })).rejects.toThrow('blueprint.config.mjs changed after dependency uninstall');

    expect(fs.readFileSync(path.join(root, 'blueprint.config.mjs'), 'utf8'))
      .toBe('export default { userOwned: true };\n');
  });
});

describe('runRemove · action-by-action revalidation', () => {
  it('revalidates a later target after an earlier recovery callback', async () => {
    arrange();
    const lifecycle = fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf8');

    const failure = await remove({
      exec: () => {
        write('package.json', '{}');
        write('blueprint.config.mjs', 'export default {};\n');
        write('.blueprint-lifecycle.json', lifecycle);
      },
      log: (line) => {
        lines.push(line);

        if (line.includes('✓ delete blueprint.config.mjs')) {
          write('.blueprint-lifecycle.json', '{"userOwned":true}\n');
        }
      },
    }).then(() => null, (error: unknown) => error as Error);

    expect(failure?.message).toBe([
      'Blueprint remove stopped after dependency uninstall because re-materialized targets no '
      + 'longer match the exact state this removal plan authorized:',
      '  ✗ .blueprint-lifecycle.json changed after dependency uninstall',
      'Before stopping, recovery re-applied these originally authorized actions:',
      '  ✓ blueprint.config.mjs',
      'The divergent targets were kept and the plan was not widened. Review or remove the listed '
      + 'content manually.',
    ].join('\n'));

    expect(exists('blueprint.config.mjs')).toBe(false);

    expect(fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf8'))
      .toBe('{"userOwned":true}\n');
  });

  it('rechecks every original action after bounded recovery', async () => {
    arrange();
    const lifecycle = fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf8');
    let configRemovals = 0;

    await expect(remove({
      exec: () => {
        write('package.json', '{}');
        write('blueprint.config.mjs', 'export default {};\n');
      },
      log: (line) => {
        lines.push(line);

        if (line.includes('✓ delete blueprint.config.mjs')) {
          configRemovals += 1;

          if (configRemovals === 2) {
            write('.blueprint-lifecycle.json', lifecycle);
          }
        }
      },
    })).rejects.toThrow('.blueprint-lifecycle.json still exists');

    expect(exists('blueprint.config.mjs')).toBe(false);
    expect(exists('.blueprint-lifecycle.json')).toBe(true);
  });
});

describe('runRemove · bounded recovery failures', () => {
  it('reports a failed bounded replay after dependency uninstall', async () => {
    arrange();
    const commands: string[] = [];

    const removeSync = fs.rmSync;
    let configRemovals = 0;

    vi.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
      if (path.basename(target.toString()) === 'blueprint.config.mjs') {
        configRemovals += 1;

        if (configRemovals === 2) {
          return;
        }
      }

      removeSync(target, options);
    });

    await expect(remove({
      exec: (command) => {
        commands.push(command);
        write('package.json', '{}');
        write('blueprint.config.mjs', 'export default {};\n');
      },
    })).rejects.toThrow('could not re-establish its authorized terminal state');

    expect(exists('blueprint.config.mjs')).toBe(true);
    expect(commands).toEqual(['npm uninstall @kekkai/blueprint']);
  });

  it('preserves a terminal state when recovery narration fails', async () => {
    arrange();

    const failure = new Error('logger unavailable');
    let configRemovals = 0;

    await expect(remove({
      exec: () => {
        write('package.json', '{}');
        write('blueprint.config.mjs', 'export default {};\n');
      },
      log: (line) => {
        lines.push(line);

        if (line.includes('✓ delete blueprint.config.mjs')) {
          configRemovals += 1;

          if (configRemovals === 2) {
            throw failure;
          }
        }
      },
    })).rejects.toBe(failure);

    expect(exists('blueprint.config.mjs')).toBe(false);
    expect(exists('.blueprint-lifecycle.json')).toBe(false);
  });
});
