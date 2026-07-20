import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runInspect } from '../dist/index.js';

/**
 * Build-time showcase generator. For each committed example project under
 * `showcase/`, it renders the folder structure, runs `blueprint inspect`
 * (loading the project's own `blueprint.config.mjs` — which self-resolves
 * `@kekkai/blueprint` inside this package), and extracts a few representative
 * files. Output is a markdown partial under `docs/.generated/showcase/`,
 * included by the Showcase pages.
 *
 * Deterministic and AI-free: the example apps and their configs are authored
 * once and committed; this only renders what is there, so every deploy shows
 * the current, real output. Drift is guarded by the e2e suite (every project
 * must stay `inspect`-clean).
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOWCASE = path.join(ROOT, 'showcase');
const OUT = path.join(ROOT, 'docs', '.generated', 'showcase');

const SILENT = () => {};

/** The example projects, in display order. One theme — a tiny stories reader. */
const ENTRIES = [
  {
    title: 'Vite + React',
    blurb: 'The `reactPreset` layers, folder modules. A page assembles a container; '
      + 'the container pulls a hook and a context; leaves never reach back up.',
    dir: 'react-vite',
    files: [
      ['pages/Home', 'src/pages/Home/Home.tsx'],
      ['containers/StoryFeed', 'src/containers/StoryFeed/StoryFeed.tsx'],
      ['hooks/useStories', 'src/hooks/useStories/useStories.ts'],
      ['contexts/ThemeContext', 'src/contexts/ThemeContext/ThemeContext.tsx'],
      ['services/storiesApi', 'src/services/storiesApi/storiesApi.ts'],
    ],
  },
  {
    title: 'Vite + Vue',
    blurb: 'Same theme, Vue vocabulary: `views` and `composables`. `provide` lives '
      + 'only in `contexts`, `inject` only in `contexts` / `composables`.',
    dir: 'vue-vite',
    files: [
      ['views/Home', 'src/views/Home/Home.vue'],
      ['containers/StoryFeed', 'src/containers/StoryFeed/StoryFeed.vue'],
      ['composables/useStories', 'src/composables/useStories/useStories.ts'],
      ['contexts/themeContext', 'src/contexts/themeContext/themeContext.ts'],
      ['services/storiesApi', 'src/services/storiesApi/storiesApi.ts'],
    ],
  },
  {
    title: 'Next.js — App Router',
    blurb: 'The `app/` route tree is the top layer (flat modules — file-based routing '
      + 'owns its own names). The same container / component / hook / context beneath it.',
    dir: 'next-app-router',
    files: [
      ['app/page', 'src/app/page.tsx'],
      ['containers/StoryFeed', 'src/containers/StoryFeed.tsx'],
      ['hooks/useStories', 'src/hooks/useStories.ts'],
      ['contexts/ThemeContext', 'src/contexts/ThemeContext.tsx'],
    ],
  },
  {
    title: 'Next.js — Pages Router',
    blurb: 'The `pages/` route tree at the top; `pages/_app` mounts the provider. '
      + 'The same layers below serve both routers unchanged.',
    dir: 'next-pages-router',
    files: [
      ['pages/index', 'src/pages/index.tsx'],
      ['pages/_app', 'src/pages/_app.tsx'],
      ['containers/StoryFeed', 'src/containers/StoryFeed.tsx'],
      ['hooks/useStories', 'src/hooks/useStories.ts'],
    ],
  },
  {
    title: 'Monorepo — turbo + pnpm',
    blurb: 'The same React app as a workspace package (`apps/web`). Blueprint runs '
      + 'per package; the structure is identical — governance travels with the code.',
    dir: 'turbo-pnpm/apps/web',
    files: [
      ['pages/Home', 'src/pages/Home/Home.tsx'],
      ['containers/StoryFeed', 'src/containers/StoryFeed/StoryFeed.tsx'],
    ],
  },
];

const IGNORE = new Set(['node_modules', 'dist', '.next', 'blueprint.config.mjs']);

/** ASCII tree of a directory (dirs first, then files, each alpha-sorted). */
function tree(dir, prefix = '') {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !IGNORE.has(entry.name))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

  return entries.flatMap((entry, index) => {
    const last = index === entries.length - 1;
    const branch = `${prefix}${last ? '└─ ' : '├─ '}${entry.name}${entry.isDirectory() ? '/' : ''}`;

    if (!entry.isDirectory()) return [branch];

    return [branch, ...tree(path.join(dir, entry.name), `${prefix}${last ? '   ' : '│  '}`)];
  });
}

async function renderEntry(entry) {
  const dir = path.join(SHOWCASE, entry.dir);
  const { ok } = await runInspect(dir, { log: SILENT });

  if (!ok) {
    throw new Error(`showcase "${entry.dir}" is not inspect-clean — fix the example before generating.`);
  }

  const structure = ['src/', ...tree(path.join(dir, 'src'), '')].join('\n');

  const codeGroup = [
    '::: code-group',
    ...entry.files.map(([label, rel]) => {
      const body = fs.readFileSync(path.join(dir, rel), 'utf-8').trimEnd();
      const lang = path.extname(rel).slice(1); // fence by file extension, not stack

      return `\`\`\`${lang} [${label}]\n${body}\n\`\`\``;
    }),
    ':::',
  ].join('\n');

  return [
    `### ${entry.title}`,
    '',
    entry.blurb,
    '',
    '`blueprint inspect` → **✓ no violations**. Structure:',
    '',
    '```',
    structure,
    '```',
    '',
    codeGroup,
    '',
  ].join('\n');
}

// runInspect is async (resolveBlueprint awaits loadConfig); render sequentially.
const sections = [];

for (const entry of ENTRIES) {
  sections.push(await renderEntry(entry));
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'sections.md'), sections.join('\n'));

console.log(`showcase: generated ${ENTRIES.length} section(s) → docs/.generated/showcase/sections.md`);
