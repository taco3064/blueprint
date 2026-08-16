import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
// Test-only import of the full emit module — src keeps the patterns-leaf
// boundary; the fixture needs emitLint's real selectors, not a paraphrase.
import { emitLint } from '../emit/lint';
import { reactPreset } from '../presets';
import {
  cli,
  configSource,
  makeRepo,
  react,
  reactBlueprint,
  read,
  rm,
  wiredEslintConfig,
  write,
} from './conformance';
import type { RepoSpec } from './conformance';

const dirs: string[] = [];

const repo = (spec: RepoSpec = {}): string => {
  const dir = makeRepo(spec);

  dirs.push(dir);

  return dir;
};

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
});

describe('merge survival — wired means still alive (batch 6, real eslint)', () => {
  const selfOnly: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'views', does: 'pages' },
        {
          name: 'contexts',
          does: 'shared state',
          allowedImporters: [{ layer: 'views', selfOnly: true }],
        },
      ],
      module: { layout: 'flat', entry: 'index', private: [] },
    },
  };

  const spec = (eslintConfig: string): RepoSpec => ({
    packageJson: react(),
    files: {
      'blueprint.config.mjs': configSource(selfOnly),
      'jsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '~app/*': ['./src/*'] } },
      }),
      'src/views/Home.jsx': 'export default 1;',
      'src/contexts/user.jsx': 'export const user = 1;',
      'eslint.config.mjs': eslintConfig,
    },
  });

  it('passes while the emitted structural rules are intact — verified, not skipped', async () => {
    const dir = repo(spec(wiredEslintConfig(selfOnly)));
    const doctor = await cli(dir, ['doctor']);

    // The skip label shares this prefix — a lazy assertion would false-pass
    // on "(skipped — could not resolve …)". Demand the verified verdict.
    expect(doctor.output).toContain('✓ emitted rules survive the merged eslint config (');
    expect(doctor.output).not.toContain('skipped');
    expect(doctor.code).toBe(0);
  });

  it('verifies an EMPTY repo through synthetic probes — no skip, no blind spot', async () => {
    const bare = (eslintConfig: string): RepoSpec => ({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(selfOnly),
        'jsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
        'eslint.config.mjs': eslintConfig,
      },
    });

    // Batch 7's irony: the anti-false-green tool used to go blind exactly
    // where nothing exists yet. Intact wiring now VERIFIES green…
    const green = await cli(repo(bare(wiredEslintConfig(selfOnly))), ['doctor']);

    expect(green.output).toContain('✓ emitted rules survive the merged eslint config (');
    expect(green.output).not.toContain('skipped');

    // …and a gutted layer turns red with zero files on disk.
    const gutting
      = '  { "files": ["src/views/**/*.js"], '
        + '"rules": { "no-restricted-syntax": ["error", "WithStatement"] } },';

    const red = await cli(repo(bare(wiredEslintConfig(selfOnly, gutting))), ['doctor']);

    expect(red.code).toBe(1);
    expect(red.output).toContain('✗ emitted rules survive the merged eslint config');
    expect(red.output).toContain('views: no-restricted-syntax lost 1 selfOnly selector(s)');
  });

  it('turns red when a later entry silently guts one layer', async () => {
    const gutting
      = '  { "files": ["src/views/**/*.jsx"], '
        + '"rules": { "no-restricted-syntax": ["error", "WithStatement"] } },';

    const dir = repo(spec(wiredEslintConfig(selfOnly, gutting)));
    const doctor = await cli(dir, ['doctor']);

    expect(doctor.code).toBe(1);
    expect(doctor.output).toContain('✗ emitted rules survive the merged eslint config');
    expect(doctor.output).toContain('views: no-restricted-syntax lost 1 selfOnly selector(s)');
    expect(doctor.output).toContain('combine both option sets into ONE entry');

    // Field run #73: an agent hand-merging this entry reproduced blueprint's exact
    // `/` escaping "defensively" and could not tell whether it had to. It did — the
    // comparison is string containment — and doctor never said so, so an equivalent
    // re-spelling reads as a loss on a config eslint would enforce correctly.
    expect(doctor.output).toContain('The comparison is textual, not semantic');
    expect(doctor.output).toContain('copy the emitted text rather than retyping it');
  });
});

describe('the tool answers for itself — no bundle archaeology (batch 12)', () => {
  it('rules prints the catalog, annotated with the declared tiers', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'blueprint.config.mjs': configSource(reactBlueprint) },
    });

    const rules = await cli(dir, ['rules']);

    expect(rules.code).toBe(0);
    expect(rules.output).toContain('Structural — dependency flow & ownership');
    expect(rules.output).toContain('maxLines → max-lines (default 400)');
    expect(rules.output).toContain('✓ error'); // unusedVars, declared in the fixture
    expect(rules.output).toContain('deadCode'); // documentation-only, stated as such
  });
});

describe('an injected-plugin gate cannot go silently vacuous', () => {
  // Three gates ride a plugin the library refuses to depend on. If the
  // generated config forgets the import or the argument, they emit nothing
  // and lint still passes — a vacuous gate that looks exactly like a green
  // one. Every artifact that carries the wiring is pinned here.
  it('the generated config imports stylistic and passes the whole options object', async () => {
    const dir = repo({
      packageJson: { ...react(), devDependencies: { typescript: '^5.0.0' } },
    });

    const init = await cli(dir, ['init', '--no-install']);
    const config = read(dir, 'eslint.config.mjs') ?? '';

    expect(init.code).toBe(0);
    expect(config).toContain('import stylistic from \'@stylistic/eslint-plugin\';');

    expect(config).toContain(
      '...emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports })',
    );

    // The install set must carry the plugin, or the import is a crash.
    expect(init.output).toContain('@stylistic/eslint-plugin');
  });

  it('a JS project still gets stylistic — only the TS argument drops', async () => {
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--no-install']);

    const config = read(dir, 'eslint.config.mjs') ?? '';

    expect(config).toContain('...emitLint(blueprint, { stylistic, imports })');
    expect(config).not.toContain('tseslint.plugin');
  });

  it('the catalog states the dependency instead of leaving it to be discovered', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'blueprint.config.mjs': configSource(reactPreset({ name: 'fixture' })) },
    });

    const rules = await cli(dir, ['rules']);

    expect(rules.code).toBe(0);
    expect(rules.output).toContain('statementsPerLine → @stylistic/max-statements-per-line');
    expect(rules.output).toContain('statementPadding → @stylistic/padding-line-between-statements');
    expect(rules.output).toContain('explicitAny → @typescript-eslint/no-explicit-any');
    // The two facts an adopting agent cannot guess: the gate needs an
    // injected plugin, and one of them rewrites files under --fix.
    expect(rules.output).toContain('emits nothing');
    expect(rules.output).toContain('all but 5 auto-fixable');
  });

  it('the playbook says why maxLines needs statementsPerLine to mean anything', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    // Prose in the playbook is hard-wrapped, so assert against a single-line
    // form — otherwise a reflow breaks the test without changing the meaning.
    const playbook = (read(dir, 'blueprint-authoring.md') ?? '').replace(/\s+/g, ' ');

    expect(playbook).toContain('statementsPerLine');
    // The merge hazard, stated where the merge happens.
    expect(playbook).toContain('emits NOTHING while lint still passes');
    // The fix pass gets its own commit, and its blast radius is named.
    expect(playbook).toContain('its OWN commit');
    expect(playbook).toContain('including tests');
    // The two reds --fix cannot clear, each with the cause an agent needs.
    expect(playbook).toContain('max-len` has no fixer');
    expect(playbook).toContain('.gitattributes`, NOT the file');
  });
});

describe('selfOnly survives every esquery, and the fold gets its selectors (batch 13)', () => {
  const selfOnly: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'views', does: 'pages' },
        {
          name: 'contexts',
          does: 'shared state',
          allowedImporters: [{ layer: 'views', selfOnly: true }],
        },
      ],
      module: { layout: 'flat', entry: 'index', private: [] },
    },
  };

  const emittedSelectors = () =>
    emitLint(selfOnly)
      .flatMap((entry) =>
        (entry.rules?.['no-restricted-syntax'] as unknown[] | undefined)?.slice(1) ?? [])
      .map((item) => (item as { selector: string }).selector);

  it('the emitted selector parses and matches on esquery 1.6 — the crash line', () => {
    // esquery below 1.7 has no `\/` escape in its regex literal: the old
    // selector truncated to `^~app\` and threw "Invalid regular expression"
    // on EVERY file of the layer — killing the project's own `eslint .` and
    // `blueprint impact` alike (field issue #19). The pinned legacy version
    // is the regression guard; this repo's own esquery is too new to crash.
    const legacy = createRequire(import.meta.url)('esquery-legacy') as {
      parse: (selector: string) => unknown;
      matches: (node: object, ast: unknown) => boolean;
    };

    const selectors = emittedSelectors();

    expect(selectors).toHaveLength(1);

    for (const selector of selectors) {
      const ast = legacy.parse(selector);

      const ban = (value: string) =>
        legacy.matches({ type: 'ExportAllDeclaration', source: { type: 'Literal', value } }, ast);

      expect(ban('~app/contexts/user')).toBe(true);
      expect(ban('~app/hooks/useX')).toBe(false);
    }
  });

  it('impact reports the re-export instead of crashing', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(selfOnly),
        'jsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
        'src/contexts/user.jsx': 'export const user = 1;',
        'src/views/Home.jsx': 'export { user } from \'~app/contexts/user\';\n',
      },
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('no-restricted-syntax');
    expect(impact.output).toContain('Home.jsx');
  });

  it('rules carries the selectors a fold needs — no emitLint dump (field issue #20)', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'blueprint.config.mjs': configSource(selfOnly) },
    });

    const json = await cli(dir, ['rules', '--json']);

    const parsed = JSON.parse(json.output) as {
      bans: {
        layer: string;
        selfOnly: { target: string; selectors: string[]; jsLiteral: string[]; note: string }[];
      }[];
    };

    const views = parsed.bans.find((entry) => entry.layer === 'views');

    expect(views?.selfOnly[0].target).toBe('contexts');
    expect(views?.selfOnly[0].selectors).toEqual(emittedSelectors());

    // The paste form, end to end through the CLI: a rendered selector loses its
    // / escape inside a JS string literal and the regex then ends at the bare
    // `/` — silently, lint green (field run #125). Parsing the literal is what the
    // paste does, so this asserts the round trip rather than the spelling.
    expect(views?.selfOnly[0].jsLiteral.map((literal) => JSON.parse(literal) as string))
      .toEqual(emittedSelectors());

    expect(JSON.parse(`"${emittedSelectors()[0]}"`)).not.toBe(emittedSelectors()[0]);

    // The text catalog prints the same strings — an agent without --json
    // still never needs to dump emitLint.
    const text = await cli(dir, ['rules']);

    expect(text.output).toContain('Paste these verbatim, quotes included');
    expect(text.output).toContain(views?.selfOnly[0].jsLiteral[0]);
    // And the caveat is in BOTH shapes, from one string. It reached only the text
    // form for three releases, so #117 raised the doubt #23 had already answered —
    // through `--json`, which is where the playbook's merge step sends a fold.
    expect(text.output).toContain(views?.selfOnly[0].note);
  });
});

describe('the required deps install on the stack the project is on (field issues #37, #41)', () => {
  it('importBlock rides import-x — config, install set and catalog agree', async () => {
    const dir = repo({ packageJson: react({ typescript: '^5.0.0' }) });

    const init = await cli(dir, ['init', '--no-install']);

    expect(init.code).toBe(0);
    // npm resolves the required-deps list as a unit, so one carrier the
    // project cannot satisfy fails the whole install and leaves init's plan
    // half-applied. eslint-plugin-import caps its eslint peer at 9 (#37), so
    // it cannot be installed at all on this baseline. import-x peers on
    // @typescript-eslint/utils@^8.56 (#41) — allowed deliberately now that
    // the baseline is ESLint 10, which no tree reaches while holding
    // typescript-eslint below 8.56; see ALLOWED_CARRIER_PEERS. The stack
    // fixtures below are what would catch that reasoning being wrong.
    expect(init.output).toContain('eslint-plugin-import-x');
    expect(init.output).not.toContain('eslint-plugin-import-lite');
    expect(init.output).not.toContain(' eslint-plugin-import ');

    const config = read(dir, 'eslint.config.mjs') ?? '';

    expect(config).toContain('import imports from \'eslint-plugin-import-x\';');

    write(dir, 'blueprint.config.mjs', configSource(reactPreset({ name: 'fixture' })));

    const rules = await cli(dir, ['rules']);

    expect(rules.output).toContain('importBlock → import-x/first + import-x/no-duplicates');
  });

  it('the emitted import-x rules actually fire under the real eslint', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(reactPreset({ name: 'fixture' })),
        // Both importBlock mistakes, in a declared layer: a module imported
        // twice, and an import sitting below code.
        'src/components/Dup.jsx':
          'import { a } from \'./m\';\n'
          + 'import { b } from \'./m\';\n'
          + 'export const Dup = () => [a, b];\n',
        'src/components/Late.jsx':
          'export const x = 1;\n'
          + 'import { c } from \'./m\';\n'
          + 'export const Late = () => c;\n',
      },
    });

    // impact lints with the emitted config through the project's own eslint,
    // so a carrier swap that only looked right in the generated text would
    // report zero here instead of the two hits below.
    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('import-x/no-duplicates');
    expect(impact.output).toContain('import-x/first');
  });
});

describe('a merge that drops a carrier cannot pass doctor (field issue #40)', () => {
  it('the ✓ states its own scope instead of implying every rule is alive', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(reactBlueprint),
        'eslint.config.mjs': wiredEslintConfig(reactBlueprint),
        'src/components/A.jsx': 'export const A = 1;\n',
      },
    });

    const doctor = await cli(dir, ['doctor']);

    // A bare "emitted rules survive" read as a promise about ALL of them; the
    // field agent trusted it over a merge that had silently lost ~68 rules.
    expect(doctor.output).toContain('emitted rules survive the merged eslint config (');
    expect(doctor.output).toContain('thresholds, package-ownership entries, and a merged entry');

    // The reach, not just the rule families: the check resolves one path per layer, so
    // an entry that replaces blueprint's on PART of a layer passes — the probe lands on
    // a sibling that still carries the selectors. `pickProbes` said "sample, not a
    // proof" in a source comment; the adopter reading the ✓ never saw it.
    expect(doctor.output).toContain('one probe per layer');
    expect(doctor.output).toContain('scoped to only part of a layer are not compared');
  });

  it('the playbook names --print-config, the step both field runs invented', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = (read(dir, 'blueprint-authoring.md') ?? '').replace(/\s+/g, ' ');

    // Two independent runs reached for it unprompted — one to catch a dropped
    // plugin, one to check their own house rules had survived. It was the
    // missing step in a verification the playbook called sufficient.
    expect(playbook).toContain('npx eslint --print-config');
    expect(playbook).toContain('A green lint is not proof the gates are ATTACHED');
    expect(playbook).toContain('proves only that the config parses');
  });

  it('points --print-config at the remainder, not at what doctor already does', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = (read(dir, 'blueprint-authoring.md') ?? '').replace(/\s+/g, ' ');

    // The step landed in the same commit that widened doctor to verify carrier
    // survival, so the playbook was asking for a sweep the gate already ran —
    // two field runs noticed the overlap (#43, #44).
    expect(playbook).toContain('you do not need to print configs by hand on this path');
    expect(playbook).toContain('the survival of your OWN rules');

    // Three ways a correct config reads as broken through this command. Each
    // cost a field agent a detour: a bare rule name looked MISSING, an unarmed
    // layer looked dropped, and selfOnly looked absent from the wrong layer.
    expect(playbook).toContain('never bare `max-len`');
    expect(playbook).toContain('does not appear at all');
    expect(playbook).toContain('resolves on the IMPORTER layer');
  });

  it('says why the carriers install even with no gate declared', async () => {
    const dir = repo({
      packageJson: react(),
      files: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`src/components/C${i}.jsx`, `export const c${i} = 1;`]),
      ),
    });

    await cli(dir, ['init', '--no-install']);

    const playbook = (read(dir, 'blueprint-authoring.md') ?? '').replace(/\s+/g, ' ');

    // Three separate runs paused on "I declared no gates, why is it installing
    // these" — harmless, but unstated. The reason is the one-line upgrade path.
    expect(playbook).toContain('Declared no gates from those families?');
    expect(playbook).toContain('deliberate, not over-installation');
  });
});

describe('the handbook does not promise a gate that does not exist (field issue #52)', () => {
  it('a generated handbook marks which machine holds each declared rule', async () => {
    const dir = repo({ packageJson: react() });

    expect((await cli(dir, ['init', '--no-install'])).code).toBe(0);

    const handbook = read(dir, 'docs/architecture-handbook.md') ?? '';

    // The handbook is the artifact meant to outlive the adoption, read by
    // people who will not have `blueprint rules` open beside it. It printed
    // `error` beside every declared rule under "`error` fails lint" — true of
    // most, false of cycles (inspect's finding) and deadCode (knip's job).
    expect(handbook).toContain('| Rule | Tier | Option | Enforced by |');
    expect(handbook).not.toContain('`error` fails lint · `warn` is advisory');
    expect(handbook).toContain('The tier is what the enforcing machine does with a violation');

    // The preset declares cycles; whatever else it declares, no row may claim
    // lint enforcement for a rule the lint config never carries.
    const rows = handbook.split('\n').filter((line) => line.startsWith('| `'));
    const cycles = rows.find((line) => line.startsWith('| `cycles`'));

    expect(cycles).toContain('`blueprint inspect`');
    expect(cycles).not.toContain('| lint |');
  });
});

/**
 * The two relative-import gates once read the same `../Sibling` differently —
 * `structure-lint`'s folder layout meant entry-only, blueprint's meant "the
 * neighbour is untouchable", and an adopting agent carried the stricter
 * reading across without noticing the names had drifted. Fifteen imports that
 * had always worked were filed as pre-existing debt, and the only remedy the
 * output offered was "extract to a lower layer" — the first stone of a
 * `utils/` junk drawer. Folder layout is entry-only now, on both gates.
 */
