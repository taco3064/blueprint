import { describe, expect, it } from 'vitest';

import { emitAgentContract } from './agent';
import {
  compactModuleBullet,
  moduleChain,
  moduleGateReach,
  moduleHardRules,
  modulePlacement,
} from './modules';
import {
  renderBehavioral,
  renderChecklist,
  renderCompactContract,
  renderContext,
  renderHardRules,
  renderPlacement,
} from './sections';
import type { ArchitectureDef, Blueprint, ModuleDef } from '../../config';

const layered: ModuleDef[] = [
  { name: 'Shell', does: 'app frame' },
  { name: 'Combat', does: 'the fight loop', owns: ['howler'], entry: 'main' },
  { name: 'Lobby', does: 'matchmaking', allowedImporters: [{ module: 'Shell', selfOnly: true }] },
  { name: 'common', does: 'shared helpers', layers: false },
];

function arch(over: Partial<ArchitectureDef> = {}, modules?: ModuleDef[]): ArchitectureDef {
  return {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI' },
      { name: 'services', does: 'net' },
    ],
    folder: { layout: 'folder', entry: 'index', private: [] },
    ...(modules ? { modules } : {}),
    ...over,
  };
}

function blueprint(architecture: ArchitectureDef): Blueprint {
  return { framework: 'react', architecture };
}

// The flat guarantee: every module renderer answers nothing, so a contract with
// no `architecture.modules` is byte-for-byte the one this tool emitted before
// the module axis existed.
describe('the flat structure renders no module directive at all', () => {
  const flat = arch();

  it.each([
    ['compactModuleBullet', compactModuleBullet],
    ['modulePlacement', modulePlacement],
    ['moduleHardRules', moduleHardRules],
  ])('%s is empty', (_label, render) => {
    expect(render(flat)).toEqual([]);
  });

  it.each([
    ['moduleChain', moduleChain],
    ['moduleGateReach', moduleGateReach],
  ])('%s is null', (_label, render) => {
    expect(render(flat)).toBeNull();
  });
});

// The two shapes `layered` is not: every module nesting the shared layers, and
// every module opting out. Each renders a different same-module sentence, and
// the second is the one the old wording was outright false on.
const allLayered: ModuleDef[] = [
  { name: 'Shell', does: 'app frame' },
  { name: 'Combat', does: 'the fight loop' },
];

const allOptOut: ModuleDef[] = [
  { name: 'common', does: 'shared helpers', layers: false },
  { name: 'Combat', does: 'the fight loop', layers: false },
];

describe('moduleChain', () => {
  it('reads in declaration order, which is the flow', () => {
    expect(moduleChain(arch({}, layered)))
      .toBe('`Shell` → `Combat` → `Lobby` → `common`');
  });
});

describe('compactModuleBullet', () => {
  const bullet = compactModuleBullet(arch({ alias: '~src' }, layered)).join('');

  it('carries the flow, the placement, and both spellings a reader gets wrong', () => {
    expect(bullet).toContain('- Module flow: `Shell` → `Combat`');
    expect(bullet).toContain('a declared layer sits one level inside a module');
    expect(bullet).toContain('Import another module at `~src/<Module>` and no deeper');
    expect(bullet).toContain('never `~src/<Module>/X`');
    expect(bullet).toContain('`~src/<Module>/<layer>`');
  });

  it('names the modules the cross-layer route does NOT exist inside', () => {
    // The measured defect: `~app/common/components` is a lint error, because a
    // `layers: false` module gets the blanket same-module ban with no layer name
    // negated back out. A bullet naming the route without naming who lacks it
    // sends an agent into that error.
    expect(bullet).toContain(
      'Not inside `common` (`layers: false`) — there it covers the whole subtree, '
      + 'cross-layer route included.',
    );
  });

  it('closes the same-module ban, never every alias spelling, when no module nests a layer', () => {
    // Measured: inside an all-opt-out module `~src/<Other>` is CLEAN and is the
    // only cross-module route there is, so a sentence saying no alias spelling
    // is legal denies the one route that works — and contradicts the entry
    // bullet beside it. This one speaks for the same-module ban alone.
    const out = compactModuleBullet(arch({ alias: '~src' }, allOptOut)).join('');

    expect(out).toContain(
      'Every module here declares `layers: false`, so the same-module ban covers each '
      + 'module\'s whole subtree — there is no cross-layer route open anywhere here.',
    );

    expect(out).toContain('Import another module at `~src/<Module>` and no deeper');
    expect(out).not.toContain('~src/<Module>/<layer>');
  });

  it('states the route unqualified when every module nests the layers', () => {
    const out = compactModuleBullet(arch({ alias: '~src' }, allLayered)).join('');

    expect(out).toContain(
      'The same-module ban leaves one path open: `~src/<Module>/<layer>`, the cross-layer '
      + 'route one depth in.',
    );

    expect(out).not.toContain('Not inside');
  });

  it('says the module root files are out of reach from inside a layer', () => {
    // Both routes to them are emitted errors, and each error message names the
    // other one — so the contract has to say the target is unreachable rather
    // than name a route. Silent where no module nests a layer: nothing is inside one.
    expect(bullet).toContain(
      'A module\'s own root files sit outside every layer: from inside a layer '
      + '`../<file>` leaves the layer and `~src/<Module>/<file>` is a same-module alias '
      + 'import, so both are errors. What a layer needs lives in a layer, never beside '
      + 'the module entry.',
    );

    expect(compactModuleBullet(arch({}, allOptOut)).join(''))
      .not.toContain('root files sit outside every layer');
  });

  it('is one bullet — the compact block is one screen', () => {
    expect(compactModuleBullet(arch({}, layered))).toHaveLength(1);
  });
});

describe('moduleGateReach', () => {
  it('names the module surface, so an all-opt-out repo is not told nothing is armed', () => {
    expect(moduleGateReach(arch({}, allOptOut)))
      .toBe('the files each module\'s globs match — a module or layer holding no code');
  });
});

describe('modulePlacement', () => {
  const out = modulePlacement(arch({}, layered)).join('\n');

  it('opens on where the folders are, then one directive per module', () => {
    expect(out).toContain('The source root holds one folder per module');
    expect(out).toContain('- `src/Shell/` — app frame. ENTRY: `index`.');
  });

  it('carries the entry on every module, inherited or overridden', () => {
    // An agent creating the module has to write this file; inferring it from the
    // shared folder shape two bullets down is a step it can get wrong silently.
    expect(out).toContain('- `src/Combat/` — the fight loop. ENTRY: `main`. OWNS: `howler`.');
  });

  it('says HOLDS only where a module opted out of the shared layers', () => {
    expect(out).toContain(
      '- `src/common/` — shared helpers. ENTRY: `index`. '
      + 'HOLDS: its own files — no declared layer sits inside it.',
    );

    expect(out.match(/HOLDS:/g)).toHaveLength(1);
  });

  it('names explicit importers, selfOnly marked, and nothing when the default holds', () => {
    expect(out).toContain('IMPORTABLE BY: Shell (selfOnly).');
    expect(out.match(/IMPORTABLE BY:/g)).toHaveLength(1);

    // A plain importer carries no marker — the label is what selfOnly ADDS, so
    // an unmarked one must not read as narrowed in the same way.
    const plain = modulePlacement(arch({}, [
      { name: 'Shell', does: 'app frame' },
      { name: 'Core', does: 'engine', allowedImporters: ['Shell'] },
    ])).join('\n');

    expect(plain).toContain('IMPORTABLE BY: Shell.');
    expect(plain).not.toContain('selfOnly');
  });
});

describe('moduleHardRules', () => {
  const bullets = moduleHardRules(arch({ alias: '~src' }, layered));

  it('is the bans emitLint actually writes for the module axis', () => {
    const text = bullets.join('\n');

    expect(text).toContain('- Import another module at `~src/<Module>` only');

    expect(text).toContain(
      '- Inside a module, import its own files relatively (`./X`), never through `~src`.',
    );

    expect(text).toContain('- A module\'s own root files sit outside every layer');
    expect(text).toContain('- A module may import only modules declared after it');
    expect(bullets).toHaveLength(4);
  });

  it('drops the root-file rule where no module has a layer inside it', () => {
    const optOut = moduleHardRules(arch({ alias: '~src' }, allOptOut));

    expect(optOut.join('\n')).toContain(
      'never through `~src`. Every module here declares `layers: false`',
    );

    expect(optOut).toHaveLength(3);
  });
});

describe('the contract sections that carry them', () => {
  const modular = arch({}, layered);

  it('adds a module flow line to Context, and none when flat', () => {
    expect(renderContext(blueprint(modular)))
      .toContain('- Module flow: `Shell` → `Combat` → `Lobby` → `common`');

    expect(renderContext(blueprint(arch()))).not.toContain('Module flow');
  });

  it('addresses a layer inside a module, never at the source root', () => {
    const out = renderPlacement(modular);

    expect(out).toContain('- `src/<Module>/components/` — UI.');
    expect(out).not.toContain('- `src/components/` — UI.');
    expect(renderPlacement(arch())).toContain('- `src/components/` — UI.');
  });

  it('carries the module address into the per-layer folder exceptions too', () => {
    const out = renderPlacement(
      arch({ layers: [{ name: 'components', does: 'UI', folder: { layout: 'flat' } }] }, layered),
    );

    expect(out).toContain('- Exception — `src/<Module>/components/`: one file per feature (flat).');
  });

  it('states ownership on both axes in the hard rules', () => {
    expect(renderHardRules(modular, undefined)).toContain(
      'their owning layer or module — what a module owns reaches every layer inside it',
    );

    expect(renderHardRules(arch(), undefined)).toContain(
      '- Restricted packages / globals live only in their owning layer (see "Where code goes").',
    );
  });

  it('moves the undeclared-folder shape to the depth that declares folders', () => {
    // Not "module, then layer, then feature": a `layers: false` module holds its
    // feature folders directly, so a three-rung ladder would be false for it.
    expect(renderBehavioral(modular, undefined, undefined)).toContain(
      'Every folder at the source root is a declared module; inside one, a declared layer or a '
      + 'feature folder.',
    );

    expect(renderBehavioral(arch(), undefined, undefined)).toContain(
      'Every folder is a declared layer or a feature folder inside one.',
    );
  });

  it('moves the undeclared-folder remedy with it, in the compact contract', () => {
    // `undeclared-folder` itself names "an existing module" at a modular source
    // root; a contract still saying "an existing layer" puts two live outputs in
    // contradiction on one finding.
    const out = renderCompactContract(blueprint(modular));

    expect(out).toContain('move the code into an existing module — or, one segment in, a folder');
    expect(out).toContain('never declare the module or layer yourself');

    const flat = renderCompactContract(blueprint(arch()));

    expect(flat).toContain('move the code into a folder of an existing layer.');
    expect(flat).toContain('never declare the layer yourself');
  });

  it('names the gates\' reach per module, and leaves the flat sentence untouched', () => {
    // An all-opt-out repo has no layer folder anywhere while `blueprint rules
    // --json` shows one live net per module. "the layer globs" tells its reader
    // nothing is armed; the flat half of the same clause has not moved.
    expect(renderCompactContract(blueprint(arch({}, allOptOut)))).toContain(
      'Hard gates (machine-enforced on the files each module\'s globs match — a module or '
      + 'layer holding no code has nothing failing yet, which is runway, not protection)',
    );

    expect(renderCompactContract(blueprint(arch()))).toContain(
      'Hard gates (machine-enforced on the files the layer globs match — a layer holding no '
      + 'code has nothing failing yet, which is runway, not protection)',
    );
  });

  it('asks the checklist for the module as well as the layer', () => {
    expect(renderChecklist(blueprint(modular)))
      .toContain('- [ ] New code sits in the right module and layer;');

    expect(renderChecklist(blueprint(arch())))
      .toContain('- [ ] New code sits in the right layer;');
  });
});

// The module axis has two physical depths and `sourceRoot` moves both: the module
// folder AND the layer nested inside it. Hardcoded `src/`, the contract told an
// agent to create `src/Shell/` in a repo whose modules sit at the project root, or
// under `lib/app/` — a placement `undeclared-folder` then reports against it.
describe.each([
  ['unset', undefined, 'src/'],
  ['.', '.', ''],
  ['./', './', ''],
  ['lib/app', 'lib/app', 'lib/app/'],
  ['./lib/app/', './lib/app/', 'lib/app/'],
])('the modular contract at sourceRoot %s', (_label, sourceRoot, prefix) => {
  const out = emitAgentContract(blueprint(arch({ sourceRoot }, layered)));

  it('anchors each module folder there', () => {
    expect(out).toContain(`- \`${prefix}Shell/\` — app frame. ENTRY: \`index\`.`);
    expect(out).toContain(`- \`${prefix}common/\` — shared helpers. ENTRY: \`index\`.`);
  });

  it('anchors the layer one level inside a module there', () => {
    expect(out).toContain(`- \`${prefix}<Module>/components/\` — UI.`);
    expect(out).toContain(`- \`${prefix}<Module>/services/\` — net.`);
  });

  // The alias spellings are NOT physical paths and must not move with the root:
  // `~app/<Module>` is what an import resolves through, wherever the tree starts.
  it('leaves every alias spelling alone', () => {
    expect(out).toContain('Import another module at `~app/<Module>` only');
    expect(out).toContain('`~app/<Module>/<layer>`');
  });

  // Restated as the whole set: one address left on the old hardcoded prefix
  // satisfies every positive assertion above and still misdirects the agent.
  it('spells the source root exactly one way across the whole contract', () => {
    expect(out.match(/^- `[\w./<>]+\/` —/gm)).toEqual([
      `- \`${prefix}Shell/\` —`,
      `- \`${prefix}Combat/\` —`,
      `- \`${prefix}Lobby/\` —`,
      `- \`${prefix}common/\` —`,
      `- \`${prefix}<Module>/components/\` —`,
      `- \`${prefix}<Module>/services/\` —`,
    ]);
  });
});
