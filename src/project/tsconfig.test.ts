import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  detectAliases,
  pathAliasKeys,
  tscArtifactsOutOfTree,
  viteTsCoverage,
} from './tsconfig';

describe('detectAliases', () => {
  it('keeps only src-targeting path entries, first declaration wins', () => {
    expect(
      detectAliases({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            paths: {
              '@/*': ['./src/*'],
              '~app/*': ['src/*'],
              '#shared/*': ['./packages/shared/*'],
            },
          },
        }),
        'tsconfig.app.json': JSON.stringify({
          compilerOptions: { paths: { '@/*': ['./other/*'] } },
        }),
      }),
    ).toEqual({ '@': 'src', '~app': 'src' });
  });

  it('skips truly broken files and shapeless configs', () => {
    expect(
      detectAliases({
        'tsconfig.json': '{ "compilerOptions": ',
        'jsconfig.json': JSON.stringify({ compilerOptions: {} }),
        'tsconfig.app.json': null,
      }),
    ).toEqual({});

    expect(
      detectAliases({
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': [42] } } }),
      }),
    ).toEqual({});
  });

  it('reads JSONC — the Vite + TS starter tsconfig is commented by default', () => {
    // Comments, trailing commas, AND `/*` living inside the very strings we
    // need (`"@/*"`) — a naive regex strip would destroy the data.
    const jsonc = `{
      // path aliases for the app
      "compilerOptions": {
        /* keep in sync with vite.config.ts */
        "paths": {
          "@/*": ["./src/*"], // primary
          "~app/*": ["./src/*"],
        },
      },
    }`;

    expect(detectAliases({ 'tsconfig.app.json': jsonc })).toEqual({ '@': 'src', '~app': 'src' });
    expect([...pathAliasKeys({ 'tsconfig.app.json': jsonc })].sort()).toEqual(['@', '~app']);
  });

  it('honors escapes and comment-looking content inside strings', () => {
    const jsonc = '{ "compilerOptions": { "paths": { "@//*": ["./src/*"], '
      + '"quoted\\"x/*": ["./x/*"] } } } // tail';

    expect([...pathAliasKeys({ 'tsconfig.json': jsonc })].sort()).toEqual(['@/', 'quoted"x']);
  });
});

describe('pathAliasKeys', () => {
  it('collects every declared alias regardless of target', () => {
    const keys = pathAliasKeys({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          paths: {
            '~app/*': ['./src/*'],
            '#shared/*': ['./packages/shared/*'],
            '/*': ['./nope/*'],
          },
        },
      }),
      'tsconfig.app.json': null,
    });

    // The doctor's question is resolvability, so non-src targets count too;
    // an empty alias (the `/*` key) is never a usable prefix.
    expect([...keys].sort()).toEqual(['#shared', '~app']);
  });

  it('returns an empty set when no config declares paths', () => {
    expect(pathAliasKeys({ 'tsconfig.json': '{ broken', 'jsconfig.json': null }).size).toBe(0);
  });
});

describe('eachPathAlias · the shapes a paths block comes back as', () => {
  it('skips a paths key explicitly set to null', () => {
    // `typeof null === 'object'`, so the null check is the only thing standing
    // between a hand-written `"paths": null` and `Object.entries(null)` — which
    // throws out of detect and takes doctor's whole alias check with it.
    expect(detectAliases({ 'tsconfig.json': '{"compilerOptions":{"paths":null}}' })).toEqual({});
    expect(pathAliasKeys({ 'tsconfig.json': '{"compilerOptions":{"paths":null}}' }).size).toBe(0);
  });

  it('cuts the trailing wildcard off a key, not the first one it finds', () => {
    // A workspace tsconfig writes several wildcards in one key. Only the
    // trailing one is the "everything under here" suffix; cutting the first
    // yields a prefix TypeScript never declared, so doctor reports the alias
    // the config DOES declare as unwired.
    expect([...pathAliasKeys({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '~pkg/*/inner/*': ['./src/*'] } },
      }),
    })]).toEqual(['~pkg/*/inner']);
  });

  it('cuts the trailing wildcard off a target, not the first one it finds', () => {
    // Same anchor on the target side, and here it decides whether the alias
    // counts as pointing at the source root. A wildcard mid-path is part of the
    // path — cutting it can turn a target that is NOT src into one that reads
    // like it, and the alias is reported wired to src while it resolves
    // somewhere else.
    expect(detectAliases({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '~odd/*': ['./sr/*c'] } },
      }),
    })).toEqual({});
  });

  it('cuts a leading ./ only where it leads', () => {
    // A redundant `./` inside a path is part of the path, not the prefix this
    // strip removes. Cutting it anywhere turns `src/./*` into a plain `src`, and
    // an alias pointing at a directory literally named `.` is reported as wired
    // to the source root.
    expect(detectAliases({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '~dot/*': ['src/./*'] } },
      }),
    })).toEqual({});
  });
});

describe('viteTsCoverage · the fact that used to be three releases of prose', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-vitets-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (file: string, text: string) => {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };

  it('reads the referenced project that pulls the vite config in', () => {
    // The modern Vite + TS template: a root of pure references, and the node
    // project lists the vite config by name. This is the shape the playbook used
    // to ASSERT was universal (field #21–#22, still a finding at #99).
    write('vite.config.ts', 'export default {}\n');
    // `"files": []` is what makes a solution config compile nothing of its own —
    // the real template carries it, and the test below shows why it matters here.
    write('tsconfig.json', '{ "files": [], "references": [{ "path": "./tsconfig.node.json" }] }');
    write('tsconfig.node.json', '{ "include": ["vite.config.ts"] }');

    expect(viteTsCoverage(dir)).toEqual({
      verdict: 'covered',
      viteFile: 'vite.config.ts',
      tsconfig: 'tsconfig.node.json',
    });
  });

  it('reads a single root config whose include leaves the vite config out', () => {
    // The other real shape, and the one this repo's own harness stages — where a
    // field agent proved `tsc -b` never reads the file by injecting a type error.
    write('vite.config.ts', 'export default {}\n');
    write('tsconfig.json', '{ "include": ["src"], "compilerOptions": { "noEmit": true } }');

    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'outside', tsconfig: 'tsconfig.json' });
  });

  it('counts a project with no files and no include as covering everything under it', () => {
    // TypeScript's own default. Reading this as "not covered" would tell an adopter
    // to run two builds where one reads both files.
    write('vite.config.mts', 'export default {}\n');
    write('tsconfig.json', '{ "compilerOptions": { "strict": true } }');

    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'covered', viteFile: 'vite.config.mts' });
  });

  it('matches a star glob against the root file', () => {
    write('vite.config.ts', 'export default {}\n');
    write('tsconfig.json', '{ "include": ["**/*.ts"] }');

    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'covered' });

    // `"src"` is the same bare-directory shape as above and must NOT reach a root file.
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{ "include": ["src/**/*"] }');
    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'outside' });
  });

  it('declines rather than guesses, once per shape it does not resolve', () => {
    // Each of these is a real tsconfig feature whose semantics this reader does not
    // reimplement. A wrong verdict is worse than none: the whole point is that the
    // report must not claim a build verified an edit it never read.
    write('vite.config.ts', 'export default {}\n');

    const declines: [string, string][] = [
      [
        'an exclude list can remove what include pulled in',
        '{ "include": ["**/*"], "exclude": ["vite.config.ts"] }',
      ],
      ['an extends base may carry the globs', '{ "extends": "./base.json" }'],
      ['a brace expansion', '{ "include": ["vite.config.{ts,mts}"] }'],
      ['a character class', '{ "include": ["vite.config.?s"] }'],
      ['an unparseable config', '{ "include": [ '],
      ['a non-string include entry', '{ "include": [42] }'],
      ['a reference chain deeper than one level', '{ "references": [{ "path": "./a.json" }] }'],
    ];

    for (const [why, text] of declines) {
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), text);
      fs.writeFileSync(path.join(dir, 'a.json'), '{ "references": [{ "path": "./b.json" }] }');
      expect(viteTsCoverage(dir), `should decline: ${why}`).toBeNull();
    }
  });

  it('declines when there is nothing to answer about', () => {
    // No vite config: the build clause has nothing to specialise.
    write('tsconfig.json', '{ "include": ["src"] }');
    expect(viteTsCoverage(dir)).toBeNull();

    // A vite config but no root tsconfig: a JS project, same non-answer.
    fs.rmSync(path.join(dir, 'tsconfig.json'));
    write('vite.config.js', 'export default {}\n');
    expect(viteTsCoverage(dir)).toBeNull();
  });

  it('resolves a reference that names a directory rather than a file', () => {
    write('vite.config.ts', 'export default {}\n');
    write('tsconfig.json', '{ "files": [], "references": [{ "path": "./tools" }] }');
    write('tools/tsconfig.json', '{ "include": ["../vite.config.ts"] }');

    // The vite config sits above the referenced project's directory, and a
    // project's globs cannot reach upward — so this is `outside`, not covered.
    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'outside' });
  });

  it('reads a solution config missing `files: []` as covering everything, because it does', () => {
    // Not a quirk of this reader — TypeScript's default include applies whenever a
    // config has neither `files` nor `include`, references or not. So `tsc -b` on
    // such a root really does compile the vite config, and answering `outside` here
    // would send an adopter to run a second build it does not need. The real Vite
    // template avoids this by carrying `files: []`.
    write('vite.config.ts', 'export default {}\n');
    write('tsconfig.json', '{ "references": [{ "path": "./tsconfig.node.json" }] }');
    write('tsconfig.node.json', '{ "include": ["src"] }');

    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'covered', tsconfig: 'tsconfig.json' });
  });

  it('declines when the root config parses to something that is not an object', () => {
    // `parseJsonc` succeeding says the text was valid JSON, not that it was a config.
    // A bare string and a literal `null` are the two shapes that reach the record
    // guard from opposite sides — without them the guard reads as decoration.
    write('vite.config.ts', 'export default {}\n');

    for (const text of ['"just a string"', 'null', '[]', '42']) {
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), text);
      expect(viteTsCoverage(dir), text).toBeNull();
    }
  });

  it('will not read a subdirectory project as covering the root file of the same name', () => {
    // `tools/tsconfig.json` listing `vite.config.ts` means `tools/vite.config.ts`.
    // Resolving its globs against the ROOT-relative path would read a file that does
    // not exist as covering the one that does — and hand back `tsc -b` alone for a
    // build that never reads the vite config.
    write('vite.config.ts', 'export default {}\n');
    write('tsconfig.json', '{ "files": [], "references": [{ "path": "./tools/tsconfig.json" }] }');
    write('tools/tsconfig.json', '{ "include": ["vite.config.ts"] }');

    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'outside', tsconfig: 'tsconfig.json' });
  });

  it('declines on every malformed shape of `references` itself', () => {
    // These are the arms a `references` reader can only get wrong silently: a
    // non-array, an entry that is not an object or carries no string `path`, a path
    // that resolves to nothing, and a referenced file that will not parse. Each one
    // is a config someone hand-edited, and each returns no answer rather than a
    // partial graph read as "none of them covers it".
    write('vite.config.ts', 'export default {}\n');

    const malformed = [
      ['references is not an array', '{ "files": [], "references": "./tsconfig.node.json" }'],
      // An object is the shape that separates this guard from the entry guard below:
      // dropping it, a `for…of` over a non-iterable throws instead of declining.
      ['references is an object', '{ "files": [], "references": { "path": "./x.json" } }'],
      ['an entry is not an object', '{ "files": [], "references": ["./tsconfig.node.json"] }'],
      ['an entry carries no path', '{ "files": [], "references": [{ "prepend": true }] }'],
      [
        'a path that resolves to nothing',
        '{ "files": [], "references": [{ "path": "./missing.json" }] }',
      ],
      [
        'a directory with no tsconfig.json in it',
        '{ "files": [], "references": [{ "path": "./tools" }] }',
      ],
    ];

    for (const [why, text] of malformed) {
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), text);
      expect(viteTsCoverage(dir), `should decline: ${why}`).toBeNull();
    }

    // …and a referenced config that parses to nothing usable.
    fs.writeFileSync(
      path.join(dir, 'tsconfig.json'),
      '{ "files": [], "references": [{ "path": "./broken.json" }] }',
    );

    write('broken.json', '{ "include": [ ');
    expect(viteTsCoverage(dir)).toBeNull();

    // A referenced config that parses to a NON-object is the other half of that arm.
    fs.writeFileSync(path.join(dir, 'broken.json'), '["not", "a", "config"]');
    expect(viteTsCoverage(dir)).toBeNull();
  });

  it('reads `files` as an exact list, and declines when it is not strings', () => {
    // `files` names paths verbatim — no globs — so a hit there is the cheapest
    // `covered` there is. A non-string entry is a hand-edit this will not interpret.
    write('vite.config.ts', 'export default {}\n');
    write('tsconfig.json', '{ "files": ["src/main.ts", "./vite.config.ts"] }');

    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'covered', tsconfig: 'tsconfig.json' });

    // Listed, but not this file: `files` present and no include means nothing else
    // is pulled in, so the answer is a definite `outside` rather than a decline.
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{ "files": ["src/main.ts"] }');
    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'outside' });

    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{ "files": [42] }');
    expect(viteTsCoverage(dir)).toBeNull();
  });

  it('names the file it found, whichever extension it is', () => {
    write('tsconfig.json', '{ "include": ["src"] }');

    for (const file of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts']) {
      for (
        const stale of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts']
      ) {
        fs.rmSync(path.join(dir, stale), { force: true });
      }

      write(file, 'export default {}\n');
      expect(viteTsCoverage(dir), file).toMatchObject({ viteFile: file });
    }
  });
});

describe('tscArtifactsOutOfTree · the artifact premise, measured instead of asserted', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-tscout-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (file: string, text: string) => {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };

  /** What `npm create vite` writes for React + TS, which is the shape that matters. */
  const viteTemplate = (over: { app?: string; node?: string } = {}) => {
    write(
      'tsconfig.json',
      '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": '
      + '"./tsconfig.node.json" }] }',
    );

    write(
      'tsconfig.app.json',
      over.app ?? '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": '
      + '"./node_modules/.tmp/tsconfig.app.tsbuildinfo" }, "include": ["src"] }',
    );

    write(
      'tsconfig.node.json',
      over.node ?? '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": '
      + '"./node_modules/.tmp/tsconfig.node.tsbuildinfo" }, "include": ["vite.config.ts"] }',
    );
  };

  it('reads the default Vite + TS template as leaving the tree untouched', () => {
    // The premise the artifact paragraph opened on — "this step produced untracked
    // files in your working tree" — is false here, and this is not an exotic repo:
    // it is what the React + TS template generates (field run #135). Both projects
    // set noEmit and send the build info under node_modules, so `tsc -b` writes
    // nothing anyone tracks.
    viteTemplate();

    expect(tscArtifactsOutOfTree(dir)).toEqual({
      buildInfo: 'node_modules/.tmp/tsconfig.app.tsbuildinfo',
      tsconfig: 'tsconfig.app.json',
    });
  });

  it('declines when one project would still write into the tree', () => {
    // The whole claim is "nothing landed", so one project that emits breaks it. Both
    // arms of that are checked, because each is a different way to land a file:
    // emitting program output, and dropping the build info beside the config.
    viteTemplate({
      node: '{ "compilerOptions": { "tsBuildInfoFile": "./node_modules/.tmp/n.tsbuildinfo" }, '
        + '"include": ["vite.config.ts"] }',
    });

    expect(tscArtifactsOutOfTree(dir)).toBeNull();

    viteTemplate({
      node: '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": "./.cache/n.tsbuildinfo" }, '
        + '"include": ["vite.config.ts"] }',
    });

    expect(tscArtifactsOutOfTree(dir)).toBeNull();
  });

  it('declines on a single root config that says nothing about either', () => {
    // The common JS-ish shape, and the honest answer is no answer: absent options
    // mean tsc's defaults, which put the build info beside the config.
    write('tsconfig.json', '{ "include": ["src"] }');

    expect(tscArtifactsOutOfTree(dir)).toBeNull();
  });

  it('declines with no tsconfig, and on one that does not parse', () => {
    expect(tscArtifactsOutOfTree(dir)).toBeNull();

    write('tsconfig.json', '{ "files": [], ');
    expect(tscArtifactsOutOfTree(dir)).toBeNull();
  });

  it('reads a root config that redirects on its own, with no references', () => {
    // No solution stub to skip — the one-project shape has to work too, or the
    // measurement only ever fires on the template it was written from.
    write(
      'tsconfig.json',
      '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": '
      + '"node_modules/.cache/t.tsbuildinfo" }, "include": ["src"] }',
    );

    expect(tscArtifactsOutOfTree(dir)).toEqual({
      buildInfo: 'node_modules/.cache/t.tsbuildinfo',
      tsconfig: 'tsconfig.json',
    });
  });

  it('declines when a referenced project cannot be read at all', () => {
    write('tsconfig.json', '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }');

    expect(tscArtifactsOutOfTree(dir)).toBeNull();
  });

  // Skipping the solution config rests on three facts together — `files` is an array,
  // it is empty, and there is no `include` — and each can be lost on its own. Any of
  // those losses widens "builds nothing" to cover a config that does build, and a
  // config that is skipped is never asked about its artifact: its in-tree build info
  // stops counting and the answer flips from "declines" to a location. Both fixtures
  // keep a well-behaved project alongside, because a wrong skip only changes the
  // answer when something else is left to supply one.
  it('skips only a config that builds nothing, not one that merely resembles it', () => {
    const solution = '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, '
      + '{ "path": "./tsconfig.lib.json" }] }';

    const app = '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": '
      + '"./node_modules/.tmp/app.tsbuildinfo" }, "include": ["src"] }';

    // Files listed and non-empty: it builds them, and its build info lands beside the
    // config rather than under node_modules.
    write('tsconfig.json', solution);
    write('tsconfig.app.json', app);

    write(
      'tsconfig.lib.json',
      '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": "./lib.tsbuildinfo" }, "files": '
      + '["src/lib.ts"] }',
    );

    expect(tscArtifactsOutOfTree(dir)).toBeNull();

    // Empty `files`, but an `include` that gives it something to build anyway — which
    // is why the empty list alone cannot decide this.
    write(
      'tsconfig.lib.json',
      '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": "./lib.tsbuildinfo" }, "files": '
      + '[], "include": ["lib"] }',
    );

    expect(tscArtifactsOutOfTree(dir)).toBeNull();
  });
});
