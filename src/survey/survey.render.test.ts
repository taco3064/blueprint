import { describe, expect, it } from 'vitest';

import { renderSurvey } from './survey';

/**
 * The folder names the sourceless note lists, read off the rendered output. A test that
 * matched `name,` in the whole report was passing on punctuation `wrapList` strips from
 * the last entry — so the rule it claimed to guard (only a zero-source folder is listed)
 * was unguarded, and replacing the filter with every folder survived the suite.
 */
function sourcelessNames(output: string): string[] {
  const lines = output.split('\n');
  const start = lines.findIndex((line) => line.includes('was never counted:'));

  if (start === -1) {
    return [];
  }

  const end = lines.findIndex((line, index) => index > start && line.trim() === '');

  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .flatMap((line) => line.split(','))
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * A sourceless list whose second line lands exactly ON the wrap width, so the `<=`
 * boundary is exercised. `< width` survived every other fixture: none reached it.
 */
function wrapWidthProbe(): string[] {
  // indent(4) + `aaaa,` … chosen so the running candidate hits exactly 74 characters.
  // indent(4) + 20 + ',' = 25; + ' ' + 20 + ',' = 47; + ' ' + 25 + ',' = exactly 74 —
  // the boundary `<=` must accept. A fourth name follows so that line is not the last
  // one, whose trailing comma the final map strips (73, and the boundary invisible).
  const names = ['a'.repeat(20), 'b'.repeat(20), 'c'.repeat(25), 'd'.repeat(10)];

  const output = renderSurvey({
    framework: null,
    typescript: false,
    packageManager: 'npm',
    aliases: {},
    rootFiles: [],
    folders: names.map((folder) => ({
      folder,
      files: 0,
      directFiles: 0,
      childFolders: 0,
      indexedChildren: 0,
      maxDepth: 0,
    })),
    edges: [],
    selfAliasImports: {},
    testEvidence: [],
    packageUsage: [],
    ownableImports: [],
    unresolved: [],
    totalFiles: 0,
  });

  const lines = output.split('\n');
  const start = lines.findIndex((line) => line.includes('was never counted:'));
  const end = lines.findIndex((line, index) => index > start && line.trim() === '');

  return lines.slice(start + 1, end);
}

describe('renderSurvey', () => {
  it('renders the unknown-framework header without folders', () => {
    const output = renderSurvey({
      framework: null,
      typescript: false,
      packageManager: 'npm',
      aliases: {},
      rootFiles: [],
      folders: [],
      edges: [],
      selfAliasImports: {},
      testEvidence: [],
      packageUsage: [],
      ownableImports: [],
      unresolved: [],
      totalFiles: 0,
    });

    expect(output).toContain('unknown framework');
    // The same-folder section always prints — the playbook cites it, so an
    // absent row read as a gap two field agents had to puzzle out (#25, #28).
    expect(output).toContain('Same-folder imports via the alias');
    expect(output).toContain('0  (none found)');
    expect(output).not.toContain('Unresolved');

    // Field issue #6: a bare heading over nothing reads as a render failure,
    // so every empty section says so out loud — and the sections that have
    // nothing to say stay out entirely rather than heading an empty list.
    expect(output).toContain('Alias: none detected in tsconfig paths');
    expect(output).toContain('Folders (module-shape evidence):\n  — none —');
    expect(output).toContain('its counts run lower):\n  — none —');
    expect(output).not.toContain('src/ root files');
    expect(output).not.toContain('Test conventions:');
    expect(output).not.toContain('Package usage');
  });

  it('renders the alias list, the folder row, and same-folder counts heaviest first', () => {
    const output = renderSurvey({
      framework: 'vue',
      typescript: true,
      packageManager: 'pnpm',
      aliases: { '~app': 'src', '~lib': 'src/lib' },
      rootFiles: ['main.ts'],
      folders: [
        {
          folder: 'views',
          files: 12,
          directFiles: 3,
          childFolders: 4,
          indexedChildren: 2,
          maxDepth: 3,
        },
      ],
      edges: [{ from: 'views', to: 'services', count: 7 }],
      selfAliasImports: { services: 2, views: 9 },
      testEvidence: [{ pattern: '**/*.test.*', files: 4 }],
      packageUsage: [{ package: 'axios', folders: ['services'] }],
      ownableImports: [{ package: 'react', name: 'createContext', folder: 'contexts' }],
      unresolved: [],
      totalFiles: 12,
    });

    // Every alias, joined — a render that stops at the first one hides half
    // the wiring the agent has to reproduce.
    expect(output).toContain('Alias: ~app → src, ~lib → src/lib');
    expect(output).toContain('src/ root files (wiring, not layers): main.ts');

    // All six folder numbers reach the line the playbook reads.
    expect(output).toContain(
      '12 source files · 3 direct · 4 child folders (2 with index) · depth 3',
    );

    // Above zero the row stands on its own, so the note is absent entirely. The needle
    // is the renderer's opening words: this used to read `holds no SOURCE file`, a string
    // the renderer stopped emitting two commits later — an assertion that cannot fail is
    // cover, and this one covered the only rule keeping the note off a folder with files.
    // Replacing the `files === 0` filter with `result.folders` survived all 1305 tests.
    expect(output).not.toContain('0 source files means');
    expect(output).toContain('7  views → services');

    // Heaviest first — object key order would have put services first.
    expect(output.indexOf('9  views')).toBeLessThan(output.indexOf('2  services'));

    expect(output).toContain('Test conventions:');
    expect(output).toContain('4  **/*.test.*');
    expect(output).toContain('axios — services');

    // Nothing in this fixture is empty, so no section may claim it is.
    expect(output).not.toContain('— none —');
  });

  it('adds the overflow line only past the 15-package cap, not at it', () => {
    const render = (count: number) =>
      renderSurvey({
        framework: null,
        typescript: false,
        packageManager: 'npm',
        aliases: {},
        rootFiles: [],
        folders: [],
        edges: [],
        selfAliasImports: {},
        testEvidence: [],
        packageUsage: Array.from({ length: count }, (_, index) => ({
          package: `pkg-${index}`,
          folders: ['services'],
        })),
        ownableImports: [],
        unresolved: [],
        totalFiles: 0,
      });

    // Exactly at the cap every package is already on the list, so the only
    // overflow line available to print would claim "… 0 more".
    expect(render(15)).toContain('pkg-14');
    expect(render(15)).not.toContain('more (use --json');

    expect(render(16)).toContain('… 1 more (use --json for the full list)');
  });

  it('says a zero-source folder is present, not empty — once, not per row', () => {
    // The row exists because the directory does, so `0` cannot mean "no folder" — and
    // it does not mean "nothing in it" either. An adopter read `styles 0 files` as an
    // empty folder, ran `ls`, and found a directory of `.css` (field run #150).
    const output = renderSurvey({
      framework: null,
      typescript: false,
      packageManager: 'npm',
      aliases: {},
      rootFiles: [],
      folders: [
        {
          folder: 'styles',
          files: 0,
          directFiles: 0,
          childFolders: 0,
          indexedChildren: 0,
          maxDepth: 0,
        },
        {
          folder: 'assets',
          files: 0,
          directFiles: 0,
          childFolders: 0,
          indexedChildren: 0,
          maxDepth: 0,
        },
        {
          folder: 'components',
          files: 4,
          directFiles: 4,
          childFolders: 0,
          indexedChildren: 0,
          maxDepth: 1,
        },
      ],
      edges: [],
      selfAliasImports: {},
      testEvidence: [],
      packageUsage: [],
      ownableImports: [],
      unresolved: [],
      totalFiles: 4,
    });

    expect(output).toContain('styles              0 source files');
    expect(output).toContain('folder is HERE and holds none');
    expect(output).toContain('This survey reads source only');

    // Once, not per folder: repeating a three-line note buries the numbers it sits
    // beside — the same reason the row itself does not carry it.
    expect(output.match(/folder is HERE and holds none/g)).toHaveLength(1);

    // Read the NAMES out of the list rather than matching `components,` in the whole
    // output: that needle depended on a trailing comma, and `wrapList` strips it from the
    // last entry — so on a fixture where `components` sorts last the assertion passed
    // whether the filter ran or not. Names, not punctuation, and order cannot break it.
    expect(sourcelessNames(output)).toEqual(['styles', 'assets']);

    // It must not read as another folder row: a blank line above it, and it opens on
    // the sentence rather than on the names, because `assets, styles: 0 source files`
    // at the rows' own indent read as a folder called "assets, styles".
    const lines = output.split('\n');
    const note = lines.findIndex((line) => line.includes('0 source files means'));

    expect(lines[note - 1]).toBe('');
    expect(lines[note].trimStart().startsWith('0 source files means')).toBe(true);
  });

  it('wraps the sourceless folder list — its length is the reader\'s repo', () => {
    // The one line in this output nothing bounded, and `public/ assets/ locales/
    // generated/` is an ordinary project. Every other line here is hand-wrapped.
    const output = renderSurvey({
      framework: null,
      typescript: false,
      packageManager: 'npm',
      aliases: {},
      rootFiles: [],
      folders: Array.from({ length: 10 }, (_, index) => ({
        folder: `sourceless-folder-${index}`,
        files: 0,
        directFiles: 0,
        childFolders: 0,
        indexedChildren: 0,
        maxDepth: 0,
      })),
      edges: [],
      selfAliasImports: {},
      testEvidence: [],
      packageUsage: [],
      ownableImports: [],
      unresolved: [],
      totalFiles: 0,
    });

    // The note's own lines, not the folder rows above it — those are a fixed 93 wherever
    // the folder name lands, and are not what went unbounded.
    const lines = output.split('\n');
    const start = lines.findIndex((line) => line.includes('0 source files means'));
    const note = lines.slice(start, lines.findIndex((line, index) => index > start && line === ''));

    expect(note.length).toBeGreaterThan(3); // the sentence, plus a wrapped list

    for (const line of note) {
      expect(line.length).toBeLessThanOrEqual(80);
    }

    // Every folder still named, in order, and read back as names rather than as a
    // substring — a `toContain` per name passes on a list that lost its commas.
    expect(sourcelessNames(output))
      .toEqual(Array.from({ length: 10 }, (_, index) => `sourceless-folder-${index}`));

    // The punctuation itself: every entry but the last is followed by a comma, and the
    // last by none. `line.replace(/,$/, '')` applied to EVERY line instead of the last
    // survived otherwise — it strips the commas that join one wrapped line to the next,
    // and a name-splitting read cannot tell.
    const listStart = note.findIndex((line) => line.includes('was never counted:'));
    const joined = note.slice(listStart + 1).join(' ').replace(/\s+/g, ' ').trim();

    expect(joined).toBe(Array.from({ length: 10 }, (_, index) => `sourceless-folder-${index}`).join(', '));

    // And the width is a `<=`: a candidate landing exactly ON the limit belongs on the
    // line it fits. `< width` survived, because no fixture had ever hit the boundary.
    const exact = wrapWidthProbe();

    expect(exact.some((line) => line.length === 74)).toBe(true);
  });

  it('caps the specifier list on the same rule as the package list', () => {
    // Its own section, its own cap, its own overflow line — sharing the wording
    // with the packages above does not make it the same list, and a react app
    // reaches sixteen concentrated specifiers long before sixteen packages.
    const render = (count: number) =>
      renderSurvey({
        framework: null,
        typescript: false,
        packageManager: 'npm',
        aliases: {},
        rootFiles: [],
        folders: [],
        edges: [],
        selfAliasImports: {},
        testEvidence: [],
        packageUsage: [],
        ownableImports: Array.from({ length: count }, (_, index) => ({
          package: 'react',
          name: `use-${index}`,
          folder: 'hooks',
        })),
        unresolved: [],
        totalFiles: 0,
      });

    expect(render(15)).toContain('react → use-14 — hooks only');
    expect(render(15)).not.toContain('more (use --json');

    expect(render(16)).toContain('… 1 more (use --json for the full list)');

    // The cap has to CAP: dropping `.slice(0, 15)` prints all sixteen rows AND the
    // overflow line, and an assertion on the overflow line alone passes either way.
    expect((render(16).match(/ — hooks only/g) ?? []).length).toBe(15);
    expect(render(16)).not.toContain('use-15');
  });

  it('prints no specifier section when there are no candidates', () => {
    // `if (result.ownableImports.length)` → `if (true)` survived: the heading and its
    // two-line explanation over an empty list, which every other section here refuses
    // to do (field issue #6 is the same shape one section up).
    const empty = renderSurvey({
      framework: null,
      typescript: false,
      packageManager: 'npm',
      aliases: {},
      rootFiles: [],
      folders: [],
      edges: [],
      selfAliasImports: {},
      testEvidence: [],
      packageUsage: [{ package: 'axios', folders: ['services'] }],
      ownableImports: [],
      unresolved: [],
      totalFiles: 1,
    });

    expect(empty).toContain('Package usage');
    expect(empty).not.toContain('Named imports in ONE folder');
    expect(empty).not.toContain('was never counted');
  });
});
