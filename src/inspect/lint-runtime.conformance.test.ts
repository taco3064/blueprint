import { deriveAdoptionAssessment } from './adoption-assessment';
import { doctorAssessmentItems } from './assessment-runtime';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { renderDoctorReport } from '../operational-contract';
import { assessLintEntrypoint } from '../project';
import { liveLintCheck } from './doctor-lint';
import { runLiveLint } from './lint-runtime';

const directories: string[] = [];
const require = createRequire(import.meta.url);
const assessment = assessLintEntrypoint({ scripts: { lint: 'eslint src' } });

function fixture(severity: 'error' | 'warn'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-prohibition-conformance-'));

  directories.push(root);
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules'));

  fs.symlinkSync(path.dirname(require.resolve('eslint/package.json')),
    path.join(root, 'node_modules/eslint'), 'junction');

  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'prohibitions', type: 'module', devDependencies: { eslint: '^9' },
  }));

  fs.writeFileSync(path.join(root, 'src/domain/violation.js'), [
    'import "leaflet/sub";',
    'export * from "react-leaflet";',
    'const source = "react-leaflet-cluster"; import(source);',
    'require("leaflet");',
    'L.divIcon();',
  ].join('\n'));

  fs.writeFileSync(path.join(root, 'src/domain/control.js'), [
    'import "leaflet-extra";',
    'function local(require) { require("leaflet") }',
    'new divIcon();',
    'L[runtime]();',
  ].join('\n'));

  const blueprint = {
    framework: 'react', architecture: { alias: '@', layers: [{
      name: 'domain', does: 'policy', layout: 'file', mustNot: [{
        id: 'render-ui', description: 'render UI', checks: [
          { package: 'leaflet' }, { package: 'react-leaflet' },
          { package: 'react-leaflet-cluster' }, { call: 'divIcon' },
        ],
      }],
    }] }, emit: { lint: { severity } },
  };

  const jiti = pathToFileURL(require.resolve('jiti')).href;
  const emitter = fileURLToPath(new URL('../emit/lint/index.ts', import.meta.url));

  fs.writeFileSync(path.join(root, 'eslint.config.mjs'), [
    `import { createJiti } from ${JSON.stringify(jiti)};`,
    'const jiti = createJiti(import.meta.url);',
    `const { emitLint } = await jiti.import(${JSON.stringify(emitter)});`,
    `export default emitLint(${JSON.stringify(blueprint)});`,
  ].join('\n'));

  return root;
}

afterEach(() => {
  for (const root of directories.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('executable prohibitions through real ESLint CLI and Doctor reporting', () => {
  it.each(['error', 'warn'] as const)('preserves %s evidence', (severity) => {
    const root = fixture(severity);
    const evidence = runLiveLint(root, ['eslint'], assessment);
    const error = severity === 'error';

    expect(evidence).toMatchObject({
      status: error ? 'failed' : 'passed', errors: error ? 5 : 0, warnings: error ? 0 : 5,
    });

    expect(evidence.prohibitionFindings).toHaveLength(5);

    expect(evidence.prohibitionFindings?.every((finding) =>
      finding.filePath.endsWith('violation.js'))).toBe(true);

    expect(evidence.prohibitionFindings).toEqual(Array.from({ length: 5 }, () =>
      expect.objectContaining({ severity, gate: error ? 'failed' : 'passed',
        observation: !error, affectsExit: error })));

    const check = liveLintCheck(evidence, assessment);

    const human = renderDoctorReport([check], {
      assessment: deriveAdoptionAssessment('current-config-adoption',
        doctorAssessmentItems('.', [check])),
    });

    const json = JSON.parse(renderDoctorReport([check], {
      assessment: deriveAdoptionAssessment('current-config-adoption',
        doctorAssessmentItems('.', [check])), json: true,
    }));

    expect(check.ok).toBe(!error);
    expect(human).toContain('render-ui');
    expect(human).toContain(`severity: ${severity}`);
    expect(human).toContain(`affectsExit: ${error}`);

    expect(json).toMatchObject({ ok: !error, counts: { failed: error ? 1 : 0 }, checks: [{
      prohibitionFindings: evidence.prohibitionFindings,
    }] });
  });
});
