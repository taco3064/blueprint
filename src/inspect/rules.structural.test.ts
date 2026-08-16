import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DOC_ONLY_RULES } from '../emit/lint/patterns';
// Test-only import of the full emit module — src keeps the patterns-leaf
// boundary (module cycle); the test pins the mirror to the real thing.
import { emitLint } from '../emit/lint';
import { runRules, STRUCTURAL_RULES } from './rules';
import type { Blueprint } from '../config';

const dirs: string[] = [];

function repo(config?: Blueprint): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-rules-'));

  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }));

  if (config) {
    fs.writeFileSync(
      path.join(dir, 'blueprint.config.mjs'),
      `export default ${JSON.stringify(config)};\n`,
    );
  }

  return dir;
}

afterEach(() => {
  while (dirs.length) {
    fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI' },
      { name: 'hooks', does: 'state', owns: [{ package: 'react', imports: ['useContext'] }] },
      { name: 'services', does: 'net', owns: ['axios', { global: 'fetch' }] },
    ],
    module: { layout: 'flat', entry: 'index', private: [] },
  },
  rules: {
    maxLines: { tier: 'error', value: 300 },
    maxStatements: { tier: 'warn' }, // object form without a value — fallback applies
    unusedVars: 'error',
    cycles: 'warn',
    deepWatch: 'error', // silenced by construction on react
    usePrefix: 'off',
  },
  emit: { lint: { severity: 'warn' } },
};

describe('runRules · the structural rows a merge needs', () => {
  it('resolves per-layer bans so nobody parses print-config by hand (field #7)', async () => {
    const lines: string[] = [];
    const { bans } = await runRules(repo(blueprint), { log: (m) => void lines.push(m) });

    // components may not import hooks/services and owns nothing — every
    // ownership ban applies to it.
    expect(bans.find((entry) => entry.layer === 'components')).toEqual({
      layer: 'components',
      forbidden: [],
      packages: ['react (useContext)', 'axios'],
      // Beside the column it is about, not once at the top: the playbook sends a
      // folding agent to `rules --json` in five places, and a consumer reading
      // `bans[i].packages` has no reason to look at a sibling key. The text output
      // carrying this caveat while `--json` did not is #117's exact shape, which came
      // back from the other channel three releases later (field run #159).
      packagesNote: expect.stringContaining('is not compared by doctor\'s survival check'),
      globals: ['fetch'],
      selfOnly: [],
      // Travels with the selectors on purpose: an entry rebuilt from selector
      // strings alone silently loses the emitted block's test exemption, and
      // the loss is invisible where nothing collides (field issue #60).
      testExemptions: ['**/*.test.{js,jsx,ts,tsx,vue}', '**/*.spec.{js,jsx,ts,tsx,vue}'],
    });

    // services owns its primitives — only the hooks-owned import stays banned.
    expect(bans.find((entry) => entry.layer === 'services')).toMatchObject({
      packages: ['react (useContext)'],
      globals: [],
    });

    // Absent where the column is: a layer banning no package has nothing to verify, and
    // a caveat about an empty list sends the reader looking for a column that is not there.
    const owner = await runRules(repo({
      ...blueprint,
      architecture: {
        ...blueprint.architecture,
        layers: [{ name: 'components', does: 'UI' }],
      },
    }), { log: () => {} });

    expect(owner.bans[0].packages).toEqual([]);
    expect(owner.bans[0]).not.toHaveProperty('packagesNote');

    // And the text output gates on the same fact, or it becomes the counterexample to the
    // reason `--json` withholds the note: a paragraph about a column reading `(none)` all
    // the way down, which is what "nothing to verify" was supposed to prevent.
    const noOwners: string[] = [];

    await runRules(repo({
      ...blueprint,
      architecture: { ...blueprint.architecture, layers: [{ name: 'components', does: 'UI' }] },
    }), { log: (m) => void noOwners.push(m) });

    expect(noOwners.join('\n')).toContain('Per-layer bans');
    expect(noOwners.join('\n')).not.toContain('is not compared by');

    // Positively too, because the caveat is spread in from a ternary whose other arm is
    // an empty list: anything at all in that arm lands as a line between the paragraph
    // and the rows, and `not.toContain('is not compared by')` stays green for every one
    // of them. Pin the seam instead — the last line of the paragraph, then the row.
    const resolved = noOwners.join('\n');
    const section = resolved.slice(resolved.indexOf('Per-layer bans')).split('\n');

    // Matched at the end rather than whole, so a re-wrap of the paragraph does not
    // fail this — the seam is what is being pinned, not the wrapping.
    expect(section.at(-2)).toMatch(/Copy, do not retype\.$/);

    expect(section.at(-1)).toBe(
      '  components     no-import: (none) · packages: (none) · globals: (none)',
    );

    const output = lines.join('\n');

    expect(output).toContain('Per-layer bans');
    expect(output).toContain('axios');

    // Each of the three ban fields prints its own "(none)", so one unqualified
    // toContain('(none)') is satisfied by whichever field happens to be empty —
    // leaving the other two free to print anything at all. Name the field.
    // And naming the field is still not enough on its own: with three layers on
    // the board, a "(none)" for one field is printed by SOME row whatever the
    // other rows say. Assert the whole row, so each field is pinned against the
    // layer it belongs to — an empty ban list and a real one are opposite
    // instructions to whoever folds these into their own config.
    expect(output).toContain(
      '  components     no-import: (none) · packages: react (useContext), axios · globals: fetch',
    );

    expect(output).toContain(
      '  services       no-import: components, hooks · packages: react (useContext) · globals: '
      + '(none)',
    );

    // The resolved view is the last thing the report prints. Anything after it
    // sits below a per-layer table and reads as one more layer's row.
    expect(output.endsWith(
      '  services       no-import: components, hooks · packages: react (useContext) · globals: '
      + '(none)',
    )).toBe(true);

    // No config → no resolved view, just the static catalog.
    const bare: string[] = [];
    const empty = await runRules(repo(), { log: (m) => void bare.push(m) });

    expect(empty.bans).toEqual([]);
    expect(bare.join('\n')).not.toContain('Per-layer bans');
  });

  it('carries the exact selfOnly selectors a merge fold needs (field #20)', async () => {
    // '~root' targets the repo root, so its selectors carry the src offset
    // (field #29); a subfolder alias would have no layer surface at all.
    const selfOnly: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        additionalAliases: { '~root': '.' },
        layers: [
          { name: 'views', does: 'pages' },
          {
            name: 'contexts',
            does: 'state seam',
            allowedImporters: [{ layer: 'views', selfOnly: true }],
          },
        ],
        module: { layout: 'flat', entry: 'index' },
      },
      rules: {},
    };

    const lines: string[] = [];
    const { bans } = await runRules(repo(selfOnly), { log: (m) => void lines.push(m) });

    // The strings must be emitLint's own, not a paraphrase — the whole point
    // is a fold that survives doctor's exact-text survival check.
    const emitted = emitLint(selfOnly)
      .flatMap((entry) => entry.rules?.['no-restricted-syntax'] as unknown[] ?? [])
      .slice(1)
      .map((item) => (item as { selector: string }).selector);

    const views = bans.find((entry) => entry.layer === 'views');

    const note = 'copy `jsLiteral`, not `selectors`: pasted into JS source a rendered selector '
      + 'loses its \\u002F escape and the regex ends at the bare /, silently. The ban '
      + 'message text is yours to write — doctor verifies selectors, never messages';

    expect(views?.selfOnly).toEqual([{
      target: 'contexts',
      selectors: emitted,
      jsLiteral: emitted.map((selector) => JSON.stringify(selector)),
      note,
    }]);

    expect(views?.selfOnly[0].selectors).toHaveLength(2); // one per alias
    expect(views?.selfOnly[0].selectors[1]).toContain('~root\\u002Fsrc\\u002Fcontexts');

    const output = lines.join('\n');

    expect(output).toContain('Paste these verbatim, quotes included');
    // The text form prints the LITERAL, because this line exists to be copied into a
    // config and the value does not survive that copy (field run #125).
    expect(output).toContain(JSON.stringify(emitted[0]));
    // Both output shapes, one string: the caveat reached only the text form for
    // three releases, so a folding agent sent to `--json` by the playbook's merge
    // step hit the same doubt #23 already answered (field issue #117). Asserting
    // the JSON's own note against the text output is what keeps them from drifting.
    expect(output).toContain(views?.selfOnly[0].note);
  });

  it('gives the selector in a form that survives being pasted into JS (field run '
    + '#125)', async () => {
    // The claim under test is about JS, so it is asserted rather than described. The
    // separators are / escapes because a raw / ends esquery's regex early — and
    // JS resolves that same escape when it parses a string literal, so the rendered
    // value pasted into '…' silently becomes /^~app/contexts// and the regex ends at
    // the bare /. No parse error, lint green, and doctor's red then reads like the
    // "equivalent respelling" false alarm it warns about, which this is not.
    const selfOnly: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'views', does: 'pages' },
          {
            name: 'contexts',
            does: 'state seam',
            allowedImporters: [{ layer: 'views', selfOnly: true }],
          },
        ],
        module: { layout: 'flat', entry: 'index' },
      },
      rules: {},
    };

    const { bans } = await runRules(repo(selfOnly), { log: () => {} });

    const ban = bans.find((entry) => entry.layer === 'views')?.selfOnly[0];
    const value = ban?.selectors[0] ?? '';

    // The trap: JSON's string escaping is JavaScript's, so parsing the rendered value
    // as a literal is what pasting it does — and it comes back a different string.
    expect(JSON.parse(`"${value}"`)).not.toBe(value);
    expect(JSON.parse(`"${value}"`)).toContain('/^~app/contexts/');
    // The form that survives: parse the literal and the value comes back intact.
    expect(JSON.parse(ban?.jsLiteral[0] ?? '')).toBe(value);
    expect(ban?.jsLiteral[0]).toMatch(/^".*"$/);
    expect(ban?.jsLiteral[0]).toContain('\\\\u002F');
  });

  it('withholds the ban message rather than omitting it by accident (field #117)', async () => {
    // The emitted entry is { selector, message }. The catalog ships the selector
    // and states that the message is the adopter's — an agent that read "carry
    // everything the emitted one did" as including the text went to an emitLint
    // dump for it, which is the one source the merge step forbids.
    const selfOnly: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'views', does: 'pages' },
          {
            name: 'contexts',
            does: 'state seam',
            allowedImporters: [{ layer: 'views', selfOnly: true }],
          },
        ],
        module: { layout: 'flat', entry: 'index' },
      },
      rules: {},
    };

    const { bans } = await runRules(repo(selfOnly), { log: () => {} });

    const messages = emitLint(selfOnly)
      .flatMap((entry) => entry.rules?.['no-restricted-syntax'] as unknown[] ?? [])
      .slice(1)
      .map((item) => (item as { message: string }).message);

    expect(messages[0]).toContain('Cannot re-export from "contexts"');

    const ban = bans.find((entry) => entry.layer === 'views')?.selfOnly[0];

    expect(JSON.stringify(ban)).not.toContain('Cannot re-export');
    expect(ban?.note).toContain('yours to write');
    expect(ban?.note).toContain('never messages');
  });

  it('reads a narrowed importer list as no reason to emit the syntax ban', async () => {
    // `allowedImporters` narrows WHO may import; `selfOnly` additionally bars
    // re-export, and only the second needs no-restricted-syntax. A list without
    // it claims a rule this config never emits — the row then contradicts the
    // emitted bundle, which is the exact drift field issue #14 reported.
    const narrowed: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'views', does: 'pages' },
          { name: 'contexts', does: 'state seam', allowedImporters: ['views'] },
        ],
        module: { layout: 'flat', entry: 'index' },
      },
      rules: {},
    };

    const lines: string[] = [];

    await runRules(repo(narrowed), { json: true, log: (m) => void lines.push(m) });

    const { structural } = JSON.parse(lines.join('')) as {
      structural: { rule: string; active: boolean }[];
    };

    expect(structural.find((rule) => rule.rule === 'no-restricted-syntax')?.active).toBe(false);
  });

  it('withholds the globals ban when every layer may use the global', async () => {
    // The ban exists to keep a global inside its owning layer. With every layer
    // owning it, there is nobody to ban — and reading the condition the other
    // way round emits the rule exactly when nothing is restricted, while
    // staying silent for the one config that does restrict something.
    const shared: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'views', does: 'pages', owns: [{ global: 'fetch' }] },
          { name: 'lib', does: 'plumbing', owns: [{ global: 'fetch' }] },
        ],
        module: { layout: 'flat', entry: 'index' },
      },
      rules: {},
    };

    const lines: string[] = [];

    await runRules(repo(shared), { json: true, log: (m) => void lines.push(m) });

    const { structural } = JSON.parse(lines.join('')) as {
      structural: { rule: string; active: boolean }[];
    };

    expect(structural.find((rule) => rule.rule === 'no-restricted-globals')?.active).toBe(false);
  });

  it('emits the machine-readable catalog under --json', async () => {
    const lines: string[] = [];

    await runRules(repo(blueprint), { json: true, log: (m) => void lines.push(m) });

    const parsed = JSON.parse(lines.join('')) as {
      severity: string;
      structural: unknown[];
      gates: { id: string }[];
      docsOnly: unknown[];
    };

    expect(parsed.severity).toBe('warn');

    // Fixture: no selfOnly importer anywhere → syntax inactive; an owned
    // global bars other layers → globals active (field issue #14).
    expect(parsed.structural).toEqual(STRUCTURAL_RULES.map((rule) => ({
      ...rule,
      active: rule.rule !== 'no-restricted-syntax',
    })));

    expect(parsed.docsOnly).toEqual(DOC_ONLY_RULES);
    expect(parsed.gates.length).toBeGreaterThan(0);
  });

  it('structural annotation mirrors emitLint exactly — '
    + 'never probe the bundle (field #14)', async () => {
    const selfOnly: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'views', does: 'pages' },
          {
            name: 'contexts',
            does: 'provide/inject seam',
            allowedImporters: [{ layer: 'views', selfOnly: true }],
          },
        ],
        module: { layout: 'flat', entry: 'index' },
      },
      rules: {},
    };

    // rules.ts mirrors emitLint's conditions instead of calling it (module
    // cycle) — this pin is what keeps the mirror from drifting.
    for (const bp of [blueprint, selfOnly]) {
      const emitted = new Set(
        emitLint(bp).flatMap((entry) => Object.keys(entry.rules ?? {})),
      );

      const lines: string[] = [];

      await runRules(repo(bp), { json: true, log: (m) => void lines.push(m) });

      const parsed = JSON.parse(lines.join('')) as {
        structural: { rule: string; active: boolean }[];
      };

      for (const row of parsed.structural) {
        expect(`${row.rule}=${String(row.active)}`).toBe(`${row.rule}=${String(emitted.has(row.rule))}`);
      }
    }
  });
});
