import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../../config';
import { emitLint } from './lint';

function blueprint(): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'auth', does: 'authentication' },
        { name: 'checkout', does: 'checkout', dependsOn: ['auth'] },
        { name: 'order', does: 'orders', dependsOn: ['checkout'] },
        { name: 'history', does: 'history', dependsOn: ['order'] },
        { name: 'profile', does: 'profile' },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder', entry: 'index' },
        { name: 'hooks', does: 'state' },
        {
          name: 'services',
          does: 'I/O',
          layout: 'folder',
          entry: 'index',
          allowedImporters: [{ layer: 'hooks', selfOnly: true }],
        },
      ],
    },
  };
}

function messages(code: string, filename: string, configured = blueprint()): Linter.LintMessage[] {
  const linter = new Linter({ configType: 'flat' });

  return linter.verify(code, emitLint(configured), { filename });
}

function passes(code: string, filename: string, configured = blueprint()): boolean {
  return messages(code, filename, configured)
    .every((message) => message.ruleId !== 'no-restricted-imports'
      && message.ruleId !== 'no-restricted-syntax');
}

describe('emitLint · module dependency DAG', () => {
  it('allows a transitive module dependency only when inner flow also allows it', () => {
    const file = 'src/history/hooks/useHistory.ts';

    expect(passes('import api from "~app/auth/services/api";', file)).toBe(true);
    expect(passes('import api from "~app/profile/services/api";', file)).toBe(false);
    expect(passes('import api from "~app/history/services/api";', file)).toBe(true);
  });

  it('rejects reverse and unrelated modules even when the inner direction is legal', () => {
    const file = 'src/auth/hooks/useAuth.ts';

    expect(passes('import api from "~app/checkout/services/api";', file)).toBe(false);
    expect(passes('import api from "~app/profile/services/api";', file)).toBe(false);
  });

  it('enforces inner flow across a reachable module independently of reachability', () => {
    const file = 'src/history/components/History.tsx';

    expect(passes('import api from "~app/auth/services/api";', file)).toBe(false);
    expect(passes('import useAuth from "~app/auth/hooks/useAuth";', file)).toBe(true);
  });

  it('allows reachable cross-module same-layer imports but bars local aliases', () => {
    const file = 'src/history/components/History/index.tsx';

    expect(passes('import Login from "~app/auth/components/Login";', file)).toBe(true);
    expect(passes('import Login from "~app/auth/components/Login/internal";', file)).toBe(false);
    expect(passes('import Local from "~app/history/components/Local";', file)).toBe(false);
  });

  it('preserves selfOnly across module boundaries', () => {
    const file = 'src/history/hooks/useHistory.ts';

    expect(passes('import api from "~app/auth/services/api";', file)).toBe(true);

    expect(passes(
      'export { api } from "~app/auth/services/api";',
      file,
    )).toBe(false);
  });

  it('governs module-root containers in both dimensions', () => {
    expect(passes(
      'import auth from "~app/auth";',
      'src/history/index.tsx',
    )).toBe(true);

    expect(passes(
      'import profile from "~app/profile";',
      'src/history/index.tsx',
    )).toBe(false);

    expect(passes(
      'import auth from "~app/auth";',
      'src/history/hooks/useHistory.ts',
    )).toBe(false);

    expect(passes(
      'import auth from "~app/auth/index.tsx";',
      'src/history/hooks/useHistory.ts',
    )).toBe(false);

    expect(passes(
      'import auth from "~app/auth/entry";',
      'src/history/hooks/useHistory.ts',
    )).toBe(false);

    expect(passes(
      'import api from "~app/auth/services/api";',
      'src/history/hooks/useHistory.ts',
    )).toBe(true);
  });

  it('keeps source-root wiring files outside the module verdict', () => {
    expect(passes(
      'import auth from "~app/auth"; import profile from "~app/profile";',
      'src/index.ts',
    )).toBe(true);
  });

  it('enforces entry boundaries across reachable modules', () => {
    const file = 'src/history/hooks/useHistory.ts';

    expect(passes('import api from "~app/auth/services/api";', file)).toBe(true);
    expect(passes('import api from "~app/auth/services/api/internal";', file)).toBe(false);
  });
});

describe('emitLint · aliases rooted inside modules', () => {
  it('applies canonical module and entry rules to aliases rooted inside modules', () => {
    const configured = blueprint();

    configured.architecture.additionalAliases = {
      '~authServices': 'src/auth/services',
      '~authApi': 'src/auth/services/api',
      '~authApiInternal': 'src/auth/services/api/internal',
      '~authEntry': 'src/auth/index.ts',
    };

    expect(passes(
      'import api from "~authServices/api";',
      'src/profile/hooks/useProfile.ts',
      configured,
    )).toBe(false);

    expect(passes(
      'import api from "~authServices/api";',
      'src/history/hooks/useHistory.ts',
      configured,
    )).toBe(true);

    expect(passes(
      'import internal from "~authServices/api/internal";',
      'src/history/hooks/useHistory.ts',
      configured,
    )).toBe(false);

    expect(passes(
      'import api from "~authApi";',
      'src/history/hooks/useHistory.ts',
      configured,
    )).toBe(true);

    expect(passes(
      'import internal from "~authApi/internal";',
      'src/history/hooks/useHistory.ts',
      configured,
    )).toBe(false);

    expect(passes(
      'import internal from "~authApiInternal";',
      'src/history/hooks/useHistory.ts',
      configured,
    )).toBe(false);

    expect(passes(
      'export { api } from "~authApi";',
      'src/history/hooks/useHistory.ts',
      configured,
    )).toBe(false);

    expect(passes(
      'import auth from "~authEntry";',
      'src/history/hooks/useHistory.ts',
      configured,
    )).toBe(false);
  });
});
