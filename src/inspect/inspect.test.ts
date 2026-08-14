import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInspect } from './inspect';
import { vuePreset } from '../presets';

let root: string;

const silent = () => {};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-inspect-'));

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeSrc(rel: string, content = ''): void {
  const full = path.join(root, 'src', rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('runInspect', () => {
  it('reports violations for a dirty project and returns ok=false', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');
    writeSrc('components/Btn/Btn.ts', 'import { api } from \'~app/services/api\';');

    const { findings, ok } = await runInspect(root, { log: silent });
    const rules = findings.map((finding) => finding.rule);

    expect(ok).toBe(false);
    expect(rules).toContain('undeclared-folder');
    expect(rules).toContain('flow-violation');
  });

  it('returns ok=true for a clean scaffolded project', async () => {
    for (const layer of vuePreset().architecture.layers) {
      fs.mkdirSync(path.join(root, 'src', layer.name), { recursive: true });
    }

    const { ok } = await runInspect(root, { log: silent });

    expect(ok).toBe(true);
  });

  it('ends the report with the coverage line, loud when the net is empty', async () => {
    writeSrc('components/Btn/Btn.vue', 'export default {};');

    let output = '';

    await runInspect(root, { log: (message) => (output = message) });
    expect(output).toContain('Coverage: 1/1 source files inside layer nets');

    // Root wiring only → same green report, but the vacuous net is named.
    fs.rmSync(path.join(root, 'src/components'), { recursive: true });
    writeSrc('main.ts', 'export {};');

    await runInspect(root, { log: (message) => (output = message) });
    expect(output).toContain('Enforcement is vacuous');
  });

  it('ends a modular report on a step the report itself does not forbid', async () => {
    // The composition, not the line. Read alone the footer is defensible on any
    // tree; read last — which is how an adopting agent reads it — it used to
    // name `src/components/`, four rows under a `missing-layer` note saying not
    // to create it and, once that folder exists, under an `✗ undeclared-module`
    // on the same path. So the assertion is a cross-check between two texts
    // produced independently: parse the footer's example, then ask the rest of
    // the report what it says about that exact path.

    // The file has to exist for the injected loader to be reached at all; what
    // it contains is never read.
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// injected');

    const loadConfig = async () => vuePreset({ structure: 'modular' });

    const endsClean = async (): Promise<string> => {
      let output = '';

      const { findings } = await runInspect(root, {
        loadConfig,
        log: (message) => (output = message),
      });

      const step = output.trim().split('\n').at(-1) ?? '';
      const example = /\(e\.g\. (\S+?)\/[\s)]/.exec(step)?.[1];

      expect(step).toContain('Enforcement is vacuous');
      expect(example).toBeDefined();
      // Not `undeclared-module`'s subject and not `missing-layer`'s ban. Both
      // are `src/<layer>`; the footer now names `src/<module>/<layer>/`.
      expect(output).not.toContain(`Do not create \`${example}\``);

      expect(findings.filter((finding) => finding.severity === 'error').map((f) => f.path))
        .not.toContain(example);

      return output;
    };

    // Two participants: `missing-layer` fires, `structure-mismatch` does not —
    // #266 floors it on a top-level source folder and there is none here.
    writeSrc('main.ts', 'export {};');

    const bare = await endsClean();

    expect(bare).toContain('Do not create `src/components`');
    expect(bare).not.toContain('[structure-mismatch]');

    // Three: the folders exist now, so `src/components` is an ✗ on screen.
    writeSrc('components/Btn.ts', 'export const b = 1;');
    writeSrc('hooks/useB.ts', 'export const useB = 1;');

    const mismatched = await endsClean();

    expect(mismatched).toContain('[structure-mismatch]');
    expect(mismatched).toContain('[undeclared-module] src/components');
  });

  it('emits JSON when asked', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');
    let output = '';

    await runInspect(root, { json: true, log: (message) => (output = message) });
    const parsed = JSON.parse(output);

    expect(parsed.ok).toBe(false);
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.coverage.sourceFiles).toBe(1);
  });
});

describe('runInspect · baseline ratchet', () => {
  it('locks existing debt, then fails only on new findings', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');

    // Record the debt.
    const update = await runInspect(root, { updateBaseline: true, log: silent });

    expect(update.ok).toBe(true);
    expect(fs.existsSync(path.join(root, '.blueprint-baseline.json'))).toBe(true);

    // Same state → clean under the baseline. Info notes are not debt, so
    // they are never suppressed — they ride along without failing the gate.
    const clean = await runInspect(root, { baseline: true, log: silent });

    expect(clean.ok).toBe(true);
    expect(clean.findings.every((finding) => finding.severity === 'info')).toBe(true);

    // A NEW violation → only it surfaces, and it fails the run.
    writeSrc('components/Btn/Btn.ts', 'import { api } from \'~app/services/api\';');

    let output = '';
    const dirty = await runInspect(root, { baseline: true, log: (m) => (output = m) });

    expect(dirty.ok).toBe(false);
    expect(dirty.findings.map((f) => f.rule)).toContain('flow-violation');
    expect(dirty.findings.map((f) => f.rule)).not.toContain('undeclared-folder');
    expect(output).toContain('baselined finding(s) suppressed');
  });

  it('reports stale entries so the ratchet can tighten', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');
    await runInspect(root, { updateBaseline: true, log: silent });

    // Pay the debt down.
    fs.rmSync(path.join(root, 'src', 'utils'), { recursive: true, force: true });

    let output = '';
    const { ok } = await runInspect(root, { baseline: true, log: (m) => (output = m) });

    expect(ok).toBe(true);
    expect(output).toContain('no longer occur');
  });

  it('treats a missing baseline file as empty — every finding is fresh', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');

    const { ok, findings } = await runInspect(root, { baseline: true, log: silent });

    expect(ok).toBe(false); // undeclared folder — fresh, nothing suppressed
    expect(findings.length).toBeGreaterThan(0);
  });

  it('locks a baseline and supports JSON output', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');
    await runInspect(root, { updateBaseline: true, log: silent });

    let output = '';

    await runInspect(root, { baseline: true, json: true, log: (m) => (output = m) });
    const parsed = JSON.parse(output);

    expect(parsed.ok).toBe(true);
    expect(parsed.suppressed).toBeGreaterThan(0);
    expect(parsed.stale).toBe(0);
  });
});

describe('runInspect · test files are exempt from structure', () => {
  it('ignores same-layer alias imports and cross-module escapes inside tests', async () => {
    // The miniapp scenario: a co-located test importing its sibling via the
    // alias — legal test plumbing, not an architecture violation.
    writeSrc('services/api/api.ts', 'export const api = 1;');
    writeSrc('services/api/api.test.ts', 'import { api } from \'~app/services/api\';');
    writeSrc('components/Btn/Btn.spec.ts', 'import { api } from \'~app/services/api\';');

    const { findings, ok } = await runInspect(root, { log: silent });

    expect(ok).toBe(true);
    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('does not flag a folder whose only code is tests, and honors overrides', async () => {
    writeSrc('legacy/old.test.ts', 'export {};');

    const clean = await runInspect(root, { log: silent });

    expect(clean.findings.map((f) => f.rule)).not.toContain('undeclared-folder');

    // Narrow the test globs — .test files become plain source again.
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');

    const { vuePreset } = await import('../presets');
    const bp = vuePreset();

    const strict = await runInspect(root, {
      log: silent,
      loadConfig: async () => ({
        ...bp,
        architecture: { ...bp.architecture, testFiles: '**/*.spec.ts' },
      }),
    });

    expect(strict.findings.map((f) => f.rule)).toContain('undeclared-folder');
  });
});

describe('runInspect · zero-finding baseline hygiene', () => {
  it('writes no baseline on a clean repo and retires a paid-off one', async () => {
    const baseline = path.join(root, '.blueprint-baseline.json');
    let output = '';

    // Truly clean: every declared layer folder exists, every owned package is
    // installed, no files, no findings. Ownership counts — an `owns` entry with
    // nothing behind it is an info note, and this arm needs zero of those.
    for (const layer of vuePreset().architecture.layers) {
      fs.mkdirSync(path.join(root, 'src', layer.name), { recursive: true });
    }

    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { vue: '^3', pinia: '^2', axios: '^1' } }),
    );

    await runInspect(root, { updateBaseline: true, log: (m) => (output = m) });
    expect(fs.existsSync(baseline)).toBe(false);
    expect(output).toContain('no baseline needed');

    // Accrue debt, lock it, pay it off — the ratchet retires itself.
    writeSrc('utils/helper.ts', 'export const x = 1;');
    await runInspect(root, { updateBaseline: true, log: silent });
    expect(fs.existsSync(baseline)).toBe(true);

    fs.rmSync(path.join(root, 'src', 'utils'), { recursive: true, force: true });
    await runInspect(root, { updateBaseline: true, log: (m) => (output = m) });

    expect(fs.existsSync(baseline)).toBe(false);
    expect(output).toContain('removed');
  });

  it('never locks info findings — notes are not debt', async () => {
    const baseline = path.join(root, '.blueprint-baseline.json');
    let output = '';

    // No src at all: every declared layer is a missing-layer info finding.
    const infoOnly = await runInspect(root, {
      updateBaseline: true,
      log: (m) => (output = m),
    });

    expect(infoOnly.findings.every((f) => f.severity === 'info')).toBe(true);
    expect(infoOnly.findings.length).toBeGreaterThan(0);
    // Nothing gets manufactured into a ledger just to have one.
    expect(fs.existsSync(baseline)).toBe(false);
    expect(output).toContain('informational note(s) are not debt');

    // Mixed: one real error plus the info notes — only the error is locked.
    writeSrc('utils/helper.ts', 'export const x = 1;');
    await runInspect(root, { updateBaseline: true, log: silent });

    const recorded = JSON.parse(fs.readFileSync(baseline, 'utf-8')) as {
      findings: { rule: string }[];
    };

    expect(recorded.findings.some((f) => f.rule === 'undeclared-folder')).toBe(true);
    expect(recorded.findings.some((f) => f.rule === 'missing-layer')).toBe(false);
    expect(recorded.findings.some((f) => f.rule === 'owns-not-installed')).toBe(false);
  });

  it('reports an owns package that is not installed without reddening the run', async () => {
    // The fixture installs `vue` only; the preset owns `pinia` and `axios` too.
    for (const layer of vuePreset().architecture.layers) {
      fs.mkdirSync(path.join(root, 'src', layer.name), { recursive: true });
    }

    const { findings, ok } = await runInspect(root, { log: silent });
    const uninstalled = findings.filter((finding) => finding.rule === 'owns-not-installed');

    expect(uninstalled.map((finding) => finding.subject).sort()).toEqual(['axios', 'pinia']);
    // A declaration ahead of its install is not a failure, so the gate stays open.
    expect(uninstalled.every((finding) => finding.severity === 'info')).toBe(true);
    expect(ok).toBe(true);
  });
});

describe('runInspect · the baseline flag gates the ledger', () => {
  it('does not consult the ledger unless asked', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');
    await runInspect(root, { updateBaseline: true, log: silent });

    let output = '';

    // Without --baseline, inspect reports every finding as it stands. Reading the
    // ledger anyway suppresses debt the caller did not ask to suppress, and the
    // run then reads clean on a repo whose findings are all still there.
    const plain = await runInspect(root, { log: (m) => (output = m) });

    expect(plain.ok).toBe(false);
    expect(output).not.toContain('baselined finding(s) suppressed');
  });

  it('reports no stale entries when there is no ledger at all', async () => {
    writeSrc('utils/helper.ts', 'export const x = 1;');

    let output = '';

    // A missing ledger is an empty ledger. A placeholder entry in its place
    // counts as recorded debt that no longer exists — the report then names stale
    // entries in a file nobody ever wrote.
    await runInspect(root, { baseline: true, log: (m) => (output = m) });

    expect(output).not.toContain('no longer occur');
    expect(output).toContain('0 baselined finding(s) suppressed');
  });
});

describe('runInspect · the module findings end to end', () => {
  function modular(): void {
    fs.writeFileSync(
      path.join(root, 'blueprint.config.mjs'),
      `export default ${JSON.stringify({
        framework: 'react',
        architecture: {
          alias: '~app',
          modules: [
            { name: 'GameStage', does: 'the run', imports: ['Session'] },
            { name: 'Session', does: 'the run state' },
            { name: 'Loadout', does: 'declared, not built yet' },
          ],
          layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
        },
      })};\n`,
    );

    writeSrc('GameStage/hooks/useRun/index.jsx', 'import { s } from \'~app/Session\';');
    writeSrc('Session/index.jsx', 'export const s = 1;');
    writeSrc('Achievements/hooks/useBadge/index.jsx', 'import { s } from \'~app/Session\';');
  }

  it('reddens on an undeclared module and stays green on a missing one', async () => {
    modular();

    let output = '';
    const { ok } = await runInspect(root, { log: (m) => (output = m) });

    // The error gates; the info does not.
    expect(ok).toBe(false);
    expect(output).toContain('[undeclared-module] src/Achievements');
    expect(output).toContain('[missing-module] src/Loadout');
    expect(output).toContain('1 error(s), 0 warning(s), 1 note(s)');
  });

  it('keeps the info note out of the baseline as debt', async () => {
    modular();

    await runInspect(root, { updateBaseline: true, log: silent });

    const recorded = fs.readFileSync(path.join(root, '.blueprint-baseline.json'), 'utf-8');

    // Runway is not debt. Locked, a note would have to be "paid down" to clear
    // a ledger it never belonged in.
    expect(recorded).toContain('undeclared-module');
    expect(recorded).not.toContain('missing-module');
  });
});
