import { describe, expect, it } from 'vitest';

import { migrateLegacyConfigSource } from './legacy-source';
import type { Blueprint } from './types';

type Shape = [name: string, layout: 'folder' | 'file', entry: string];

function migrated(...layers: Shape[]): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: layers.map(([name, layout, entry]) => ({ name, does: name, layout, entry })),
    },
  };
}

const folder = migrated(['pages', 'folder', 'index'], ['hooks', 'folder', 'index']);

function rewritten(source: string, blueprint: Blueprint = folder): string {
  const result = migrateLegacyConfigSource(source, blueprint);

  expect(result.kind).toBe('rewritten');

  return (result as { source: string }).source;
}

describe('migrateLegacyConfigSource · preset-spreading 3.2 config', () => {
  const original = [
    'import { defineBlueprint, reactPreset } from \'@kekkai/blueprint\';',
    '',
    '// The preset stays spread in unchanged.',
    'export default defineBlueprint({',
    '  ...reactPreset({ name: \'sky\' }),',
    '  architecture: {',
    '    alias: \'~app\',',
    '    layers: [',
    '      {',
    '        name: \'pages\',',
    '        does: \'Mounts the shell.\',',
    '      },',
    '      {',
    '        name: \'hooks\',',
    '        does: \'Adapts the engine.\',',
    '      },',
    '    ],',
    '    /* test files */',
    '    testFiles: [\'**/*.test.ts\'],',
    '    module: { layout: \'folder\', entry: \'index\', private: [\'hooks\'] },',
    '    naming: { hook: \'useX\' },',
    '  },',
    '});',
    '',
  ].join('\n');

  it('removes the unit shape, declares non-default layouts, and keeps every other byte', () => {
    expect(rewritten(original)).toBe([
      'import { defineBlueprint, reactPreset } from \'@kekkai/blueprint\';',
      '',
      '// The preset stays spread in unchanged.',
      'export default defineBlueprint({',
      '  ...reactPreset({ name: \'sky\' }),',
      '  architecture: {',
      '    alias: \'~app\',',
      '    layers: [',
      '      {',
      '        name: \'pages\',',
      '        layout: \'folder\',',
      '        does: \'Mounts the shell.\',',
      '      },',
      '      {',
      '        name: \'hooks\',',
      '        layout: \'folder\',',
      '        does: \'Adapts the engine.\',',
      '      },',
      '    ],',
      '    /* test files */',
      '    testFiles: [\'**/*.test.ts\'],',
      '    naming: { hook: \'useX\' },',
      '  },',
      '});',
      '',
    ].join('\n'));
  });

  it('keeps CRLF line endings on inserted and removed lines', () => {
    expect(rewritten(original.replaceAll('\n', '\r\n')))
      .toBe(rewritten(original).replaceAll('\n', '\r\n'));
  });

  it('reads a plain exported object and quoted keys too', () => {
    const source = 'export default {\n  "architecture": {\n    "layers": [\n      {\n'
      + '        "name": "pages",\n        "module": { "layout": "folder" },\n      },\n'
      + '      { "name": "hooks", "module": { "layout": "folder" } },\n    ],\n  },\n};\n';

    expect(rewritten(source)).toBe('export default {\n  "architecture": {\n    "layers": [\n'
      + '      {\n        "name": "pages",\n        layout: "folder",\n      },\n'
      + '      { "name": "hooks", layout: "folder" },\n    ],\n  },\n};\n');
  });
});

describe('migrateLegacyConfigSource · layer edits', () => {
  const layer = (body: string, blueprint: Blueprint) => rewritten(
    `export default { architecture: { module: {}, layers: [${body}] } };`,
    blueprint,
  );

  it.each<[string, string]>([
    [
      '{ name: \'pages\', does: \'x\' }',
      '{ name: \'pages\', layout: \'folder\', entry: \'page\', does: \'x\' }',
    ],
    [
      '{ name: \'pages\' }',
      '{ name: \'pages\', layout: \'folder\', entry: \'page\' }',
    ],
    [
      '{\n  name: \'pages\'\n}',
      '{\n  name: \'pages\',\n  layout: \'folder\',\n  entry: \'page\'\n}',
    ],
    [
      '{\n  name: \'pages\',\n  does: \'x\',\n}',
      '{\n  name: \'pages\',\n  layout: \'folder\',\n  entry: \'page\',\n  does: \'x\',\n}',
    ],
    [
      '{\n  name: \'pages\', does: \'x\' }',
      '{\n  name: \'pages\', layout: \'folder\', entry: \'page\', does: \'x\' }',
    ],
    [
      '{\n  name: \'pages\', does: \'x\' }\n',
      '{\n  name: \'pages\', layout: \'folder\', entry: \'page\', does: \'x\' }\n',
    ],
    [
      '{\n  name: \'pages\', // shell\n  does: \'x\',\n}',
      '{\n  name: \'pages\', // shell\n  layout: \'folder\',\n'
      + '  entry: \'page\',\n  does: \'x\',\n}',
    ],
  ])('inserts after the name: %j', (body, expected) => {
    expect(layer(body, migrated(['pages', 'folder', 'page'])))
      .toBe(`export default { architecture: { layers: [${expected}] } };`);
  });

  it('adds the comma a last name lacks even when another layer follows', () => {
    expect(layer(
      '{\n  name: \'pages\'\n}, { name: \'hooks\' }',
      migrated(['pages', 'folder', 'index'], ['hooks', 'file', 'index']),
    )).toBe('export default { architecture: { layers: [{\n  name: \'pages\',\n'
      + '  layout: \'folder\'\n}, { name: \'hooks\' }] } };');
  });

  it('declares only the fields that differ from the 4.x defaults', () => {
    expect(layer(
      '{ name: \'a\', module: { entry: \'main\' } }, { name: \'b\' }',
      migrated(['a', 'file', 'main'], ['b', 'file', 'index']),
    )).toBe('export default { architecture: { layers: [{ name: \'a\', entry: \'main\' }, '
      + '{ name: \'b\' }] } };');
  });

  it('accepts a name written as an expression', () => {
    expect(layer('{ name: pages }', migrated(['pages', 'folder', 'index'])))
      .toBe('export default { architecture: { layers: [{ name: pages, layout: \'folder\' }] } };');
  });

  it('follows the name literal\'s quotes and escapes the declared value', () => {
    expect(layer('{ name: "a" }', migrated(['a', 'file', 'it"s\\x'])))
      .toBe('export default { architecture: { layers: [{ name: "a", '
        + 'entry: "it\\"s\\\\x" }] } };');

    expect(layer('{ name: \'a\' }', migrated(['a', 'file', 'it\'s'])))
      .toBe('export default { architecture: { layers: [{ name: \'a\', entry: \'it\\\'s\' }] } };');
  });
});

describe('migrateLegacyConfigSource · retired key removal', () => {
  const pages = migrated(['pages', 'file', 'index']);
  const wrap = (architecture: string) => `export default { architecture: ${architecture} };`;

  it.each<[string, string]>([
    [
      '{\n  alias: \'~app\',\n  module: {\n    layout: \'flat\',\n  },\n'
      + '  layers: [{ name: \'pages\' }],\n}',
      '{\n  alias: \'~app\',\n  layers: [{ name: \'pages\' }],\n}',
    ],
    [
      '{\r\n  module: {},\r\n  layers: [{ name: \'pages\' }],\r\n}',
      '{\r\n  layers: [{ name: \'pages\' }],\r\n}',
    ],
    [
      '{\n  layers: [{ name: \'pages\' }],\n  module: {}\n}',
      '{\n  layers: [{ name: \'pages\' }],\n}',
    ],
    [
      '{ module: {}, layers: [{ name: \'pages\' }] }',
      '{ layers: [{ name: \'pages\' }] }',
    ],
    [
      '{ layers: [{ name: \'pages\' }], module: {} }',
      '{ layers: [{ name: \'pages\' }] }',
    ],
    [
      '{ layers: [{ name: \'pages\' }], /* shared */ module: {} }',
      '{ layers: [{ name: \'pages\' }] /* shared */  }',
    ],
    [
      '{\n  module: {}, // shared shape\n  layers: [{ name: \'pages\' }],\n}',
      '{\n  // shared shape\n  layers: [{ name: \'pages\' }],\n}',
    ],
    [
      '{ \'module\': {}, layers: [{ name: \'pages\', module: {} }] }',
      '{ layers: [{ name: \'pages\' }] }',
    ],
    [
      '{\n  module: {\n    // why private\n    private: [\'hooks\'],\n  },\n'
      + '  layers: [{ name: \'pages\' }],\n}',
      '{\n  // why private\n  layers: [{ name: \'pages\' }],\n}',
    ],
    [
      '{\r\n  module: {\r\n    /* a\r\n    b */\r\n    private: [],\r\n  },\r\n'
      + '  layers: [{ name: \'pages\' }],\r\n}',
      '{\r\n  /* a\r\n    b */\r\n  layers: [{ name: \'pages\' }],\r\n}',
    ],
    [
      '{ module: { /* c */ layout: \'flat\' }, layers: [{ name: \'pages\' }] }',
      '{ /* c */ layers: [{ name: \'pages\' }] }',
    ],
    [
      '{ alias: \'~app\', module: { // c\n  layout: \'flat\' }, layers: [{ name: \'pages\' }] }',
      '{ alias: \'~app\', // c\nlayers: [{ name: \'pages\' }] }',
    ],
    [
      '{ alias: \'~app\', module: { // c\r\n  layout: \'flat\' }, layers: [{ name: \'pages\' }] }',
      '{ alias: \'~app\', // c\r\nlayers: [{ name: \'pages\' }] }',
    ],
    [
      '{ layers: [{ name: \'pages\' }], module: { /* c */ } }',
      '{ layers: [{ name: \'pages\' }] /* c */  }',
    ],
    [
      '{ layers: [{ name: \'pages\' }], /* x */ module: { /* c */ } }',
      '{ layers: [{ name: \'pages\' }] /* x */ /* c */  }',
    ],
  ])('removes %j', (architecture, expected) => {
    expect(rewritten(wrap(architecture), pages)).toBe(wrap(expected));
  });

  it('rewrites the architecture that wins when the key repeats', () => {
    expect(rewritten(
      'export default { architecture: {}, '
      + 'architecture: { module: {}, layers: [{ name: \'pages\' }] } };',
      pages,
    )).toBe('export default { architecture: {}, '
      + 'architecture: { layers: [{ name: \'pages\' }] } };');
  });

  it('keeps a spread that the literal architecture overrides', () => {
    expect(rewritten(
      'export default { ...base, architecture: { module: {}, layers: [{ name: \'pages\' }] } };',
      pages,
    )).toBe('export default { ...base, architecture: { layers: [{ name: \'pages\' }] } };');
  });

  it('keeps the properties that follow the architecture', () => {
    expect(rewritten(
      'export default { architecture: { module: {}, layers: [{ name: \'pages\' }] }, '
      + 'name: \'x\' };',
      pages,
    )).toBe('export default { architecture: { layers: [{ name: \'pages\' }] }, name: \'x\' };');
  });
});

describe('migrateLegacyConfigSource · keys that are not literal properties', () => {
  const pages = migrated(['pages', 'folder', 'index'], ['hooks', 'file', 'use']);

  it.each([
    ['unparseable source', 'export default {'],
    ['no default export', 'export const config = {};'],
    ['a default export that is an identifier', 'const config = {};\nexport default config;'],
    ['another call', 'export default reactPreset({ architecture: { module: {}, '
    + 'layers: [{ name: \'pages\' }, { name: \'hooks\' }] } });'],
    ['defineBlueprint of a variable', 'export default defineBlueprint(config);'],
    ['defineBlueprint without an argument', 'export default defineBlueprint();'],
    ['no architecture', 'export default { name: \'x\' };'],
    ['a spread after the architecture', 'export default { architecture: { module: {}, '
    + 'layers: [{ name: \'pages\' }, { name: \'hooks\' }] }, ...override };'],
    ['an architecture built elsewhere', 'export default { architecture: shared };'],
    ['a spread inside the architecture', 'export default { architecture: { ...shared, '
    + 'layers: [{ name: \'pages\' }, { name: \'hooks\' }] } };'],
    ['a computed key', 'export default { architecture: { [key]: {}, module: {}, '
    + 'layers: [{ name: \'pages\' }, { name: \'hooks\' }] } };'],
    ['a numeric key', 'export default { architecture: { 0: {}, module: {}, '
    + 'layers: [{ name: \'pages\' }, { name: \'hooks\' }] } };'],
    ['no layers', 'export default { architecture: { module: {} } };'],
    ['layers built elsewhere', 'export default { architecture: { module: {}, layers } };'],
    ['repeated layers', 'export default { architecture: { module: {}, layers: [], layers: [] } };'],
    ['a different layer count', 'export default { architecture: { module: {}, '
    + 'layers: [{ name: \'pages\' }] } };'],
    ['a spread layer', 'export default { architecture: { module: {}, '
    + 'layers: [{ name: \'pages\' }, ...more] } };'],
    ['a layer hole', 'export default { architecture: { module: {}, '
    + 'layers: [{ name: \'pages\' }, ,] } };'],
    ['a layer built elsewhere', 'export default { architecture: { module: {}, '
    + 'layers: [{ name: \'pages\' }, hooks] } };'],
    ['a spread inside a layer', 'export default { architecture: { module: {}, '
    + 'layers: [{ name: \'pages\' }, { ...hooks }] } };'],
    ['a layer without a name', 'export default { architecture: { module: {}, '
    + 'layers: [{ name: \'pages\' }, { does: \'x\' }] } };'],
    ['a layer name that disagrees', 'export default { architecture: { module: {}, '
    + 'layers: [{ name: \'pages\' }, { name: \'state\' }] } };'],
    ['no retired key in the literal', 'export default { architecture: { '
    + 'layers: [{ name: \'pages\' }, { name: \'hooks\' }] } };'],
  ])('leaves the source to the owner for %s', (_case, source) => {
    expect(migrateLegacyConfigSource(source, pages)).toEqual({
      kind: 'manual',
      declarations: [{ layer: 'pages', layout: 'folder' }, { layer: 'hooks', entry: 'use' }],
    });
  });
});

describe('migrateLegacyConfigSource · separators and neighbouring properties', () => {
  const config = (architecture: string) => `export default { architecture: { ${architecture} } };`;

  it('removes a first property with a comment before its comma, leaving outer commas', () => {
    const lines = (module: string[]) => [
      'export default defineBlueprint({',
      '  ...reactPreset({ name: \'sky\' }),',
      '  architecture: {',
      ...module,
      '    layers: [{ name: \'pages\' }, { name: \'hooks\' }],',
      '  },',
      '});',
      '',
    ].join('\n');

    expect(rewritten(
      lines(['    module: { private: [] } /* retired */,']),
      migrated(['pages', 'file', 'index'], ['hooks', 'file', 'index']),
    )).toBe(lines(['    /* retired */']));
  });

  it('removes a property whose comma sits on the next line when no comma precedes it', () => {
    expect(rewritten(
      config('module: {} // retired\n  , layers: [{ name: \'pages\' }]'),
      migrated(['pages', 'file', 'index']),
    )).toBe(config('// retired\nlayers: [{ name: \'pages\' }]'));
  });

  it('removes a last property that follows its comma directly', () => {
    expect(rewritten(
      config('layers: [{ name: \'pages\' }],module: {}'),
      migrated(['pages', 'file', 'index']),
    )).toBe(config('layers: [{ name: \'pages\' }]'));
  });

  it('inserts beside a name that shares the opening brace\'s line and ends it with a comma', () => {
    expect(rewritten(
      config('module: {}, layers: [{ name: \'pages\',\n  does: \'x\' }]'),
      migrated(['pages', 'folder', 'index']),
    )).toBe(config('layers: [{ name: \'pages\', layout: \'folder\',\n  does: \'x\' }]'));
  });

  it('inserts beside a name whose object closes on the same line', () => {
    expect(rewritten(
      config('module: {}, layers: [{\n  name: \'pages\' }]'),
      migrated(['pages', 'folder', 'index']),
    )).toBe(config('layers: [{\n  name: \'pages\', layout: \'folder\' }]'));
  });

  const layer = (body: string[]) => [
    'export default { architecture: {',
    '  module: {},',
    '  layers: [',
    '    {',
    ...body,
    '    },',
    '  ],',
    '} };',
    '',
  ].join('\n');

  it.each<[string, string[], string[]]>([
    [
      'a retired module that spans lines',
      ['      name: \'pages\', does: \'x\', module: {', '        layout: \'folder\',', '      },'],
      ['      name: \'pages\', layout: \'folder\', does: \'x\', '],
    ],
    [
      'an array that spans lines',
      ['      name: \'pages\', owns: [', '        \'x\',', '      ],'],
      ['      name: \'pages\', layout: \'folder\', owns: [', '        \'x\',', '      ],'],
    ],
    [
      'a template literal that spans lines',
      ['      name: \'pages\', does: `Mounts', '        the shell.`,'],
      ['      name: \'pages\', layout: \'folder\', does: `Mounts', '        the shell.`,'],
    ],
    [
      'a comma that starts the next line',
      ['      name: \'pages\'', '      , does: \'x\''],
      ['      name: \'pages\', layout: \'folder\'', '      , does: \'x\''],
    ],
  ])('inserts beside the name when %s shares its line', (_case, body, expected) => {
    expect(rewritten(layer(body), migrated(['pages', 'folder', 'index'])))
      .toBe(layer(expected).replace('  module: {},\n', ''));
  });
});

describe('migrateLegacyConfigSource · a retired last property below a name', () => {
  const layers = (lines: string[]) =>
    ['export default { architecture: { layers: [{', ...lines].join('\n');

  it.each<[string, string[], string[]]>([
    [
      'its line comment',
      ['  name: \'pages\',', '  module: { layout: \'folder\' } // folders', '}] } };'],
      ['  name: \'pages\',', '  layout: \'folder\',', '  // folders', '}] } };'],
    ],
    [
      'its block comment',
      ['  name: \'pages\',', '  module: { layout: \'folder\' } /* folders */', '}] } };'],
      ['  name: \'pages\',', '  layout: \'folder\',', '  /* folders */', '}] } };'],
    ],
    [
      'a comment on each line',
      ['  name: \'pages\', // the shell', '  module: { layout: \'folder\' } // folders', '}] } };'],
      ['  name: \'pages\', // the shell', '  layout: \'folder\',', '  // folders', '}] } };'],
    ],
    [
      'the closing braces',
      ['  name: \'pages\',', '  module: { layout: \'folder\' } }] } };'],
      ['  name: \'pages\',', '  layout: \'folder\',', '  }] } };'],
    ],
  ])('keeps a name\'s comma before a retired module and %s', (_, before, after) => {
    expect(rewritten(layers(before), migrated(['pages', 'folder', 'index']))).toBe(layers(after));
  });
});
