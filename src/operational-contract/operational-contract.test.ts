import { describe, expect, expectTypeOf, it } from 'vitest';

import { KNOWN_FLAGS } from '../cli/args';
import {
  renderCliCommandHelp,
  renderInvalidAgent,
  renderUnknownFlag,
} from './index';
import type { OperationalText } from './index';

describe('CLI operational contract', () => {
  it('covers exactly every command that owns a flag contract', () => {
    const help = renderCliCommandHelp({ brownfieldMinFiles: 20 });

    expect(Object.keys(help).sort()).toEqual(Object.keys(KNOWN_FLAGS).sort());
    expectTypeOf(help).toMatchTypeOf<Record<keyof typeof KNOWN_FLAGS, OperationalText>>();
    expectTypeOf<string>().not.toMatchTypeOf<OperationalText>();
  });

  it('renders runtime facts instead of freezing one error or threshold', () => {
    const small = renderCliCommandHelp({ brownfieldMinFiles: 7 });
    const large = renderCliCommandHelp({ brownfieldMinFiles: 70 });

    expect(small.init).toContain('threshold, 7 source files');
    expect(large.init).toContain('threshold, 70 source files');
    expect(small.init).not.toBe(large.init);

    expect(renderInvalidAgent(['claude', 'codex'])).toContain('claude | codex');
    expect(renderInvalidAgent(['codex'])).not.toContain('claude');

    expect(renderUnknownFlag('inspect', '--verbose'))
      .toBe('unknown flag for inspect: --verbose — see: blueprint inspect --help');

    expect(renderUnknownFlag('doctor', '--fix'))
      .toBe('unknown flag for doctor: --fix — see: blueprint doctor --help');
  });

  it('describes init from resolved topology, source root, and output policy', () => {
    const init = renderCliCommandHelp({ brownfieldMinFiles: 10 }).init;

    expect(init).toContain('fresh layer-first preset only');
    expect(init).toContain('under the resolved\n    sourceRoot');
    expect(init).toContain('module-first authors its module map first');
    expect(init).toContain('handbook at emit.handbook');
    expect(init).toContain('only the Agent contracts selected by resolved emit.agents');
    expect(init).not.toContain('src/<layer>/');
    expect(init).not.toContain('and AI agent contracts (CLAUDE.md, AGENTS.md)');
  });
});
