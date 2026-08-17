import { defineBlueprint } from '../config';
import type { Blueprint, EmitDef, Framework, OwnedPrimitive } from '../config';
import { componentShape, playbook, principles } from './doctrine';

/** Options for a preset factory. */
export interface PresetOptions {
  /** Project name (Handbook title / agent contract). */
  name?: string;
  /** Import alias. Defaults to `~app`. */
  alias?: string;
  /**
   * Emit overrides — e.g. `emit: { agents: ['claude'] }`, the first customization
   * nearly every adoption makes. Passed straight through.
   */
  emit?: EmitDef;
}

/** Which Next.js router directory the route tree lives in. */
export type NextRouter = 'app' | 'pages' | 'both';

/** Options for the Next.js preset. */
export interface NextPresetOptions extends PresetOptions {
  /** Route tree: App Router (`app/`), Pages Router (`pages/`), or both (migration). */
  router?: NextRouter;
  /** Layers live under `src/` (`create-next-app --src-dir`); otherwise the project root. */
  srcDir?: boolean;
}

/** Framework-specific primitive ownership. */
interface FrameworkOwns {
  hooks: OwnedPrimitive[];
  contexts: OwnedPrimitive[];
}

/** Build a fresh, validated Blueprint. Every call returns an independent object. */
function preset(framework: Framework, owns: FrameworkOwns, options: PresetOptions): Blueprint {
  return defineBlueprint({
    name: options.name,
    framework,
    architecture: {
      alias: options.alias ?? '~app',
      layers: [
        {
          name: 'pages',
          does: 'Route layout — assembles containers; owns routing and SEO concerns.',
          mustNot: ['hold business logic', 'stack components directly'],
        },
        {
          name: 'containers',
          does: 'A feature: assembles components, owns local state, calls services, '
            + 'drives navigation.',
        },
        {
          name: 'components',
          does: 'Reusable, presentational UI.',
          mustNot: ['call services', 'touch the router', 'own app state'],
        },
        {
          name: 'hooks',
          does: 'Adapts server and shared state; the only layer that injects context or owns a '
            + 'store.',
          owns: owns.hooks,
        },
        {
          name: 'contexts',
          does: 'Defines and provides Context / Provider only.',
          owns: owns.contexts,
          allowedImporters: [
            { layer: 'containers', description: 'Provider only' },
            { layer: 'hooks', selfOnly: true, description: 'Context only' },
          ],
        },
        {
          name: 'services',
          does: 'Network primitives — the only layer that talks to the HTTP client or sockets.',
          owns: ['axios', { global: 'fetch' }, { global: 'WebSocket' }],
          allowedImporters: ['containers', 'hooks', 'contexts'],
        },
      ],
      folder: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
      naming: {
        component: 'PascalCase; the implementation file is named after the folder',
        hook: 'useX — only when it genuinely uses reactivity',
        service: 'snake_case',
        context: 'XxxProvider / XxxContext',
      },
    },
    principles: principles(),
    componentShape: componentShape(),
    playbook: playbook(),
    rules: {
      maxLines: { tier: 'error', value: 400 },
      // SRP triage — entry points only, never verdicts (handbook axes #2/#3).
      maxLinesPerFunction: { tier: 'warn', value: 100 },
      maxParams: { tier: 'warn', value: 3 },
      maxStatements: { tier: 'warn', value: 15 },
      complexity: { tier: 'warn', value: 12 },
      unusedVars: 'error',
      // `any` is the cheapest way to widen an interface past the point where
      // illegal states are unrepresentable (principle: narrow-interfaces).
      explicitAny: 'error',
      // ESLint owns formatting here — there is no second formatter to
      // coordinate with, and a red line is the agent's own repair signal.
      codeStyle: 'error',
      // Pins what a "line" means for maxLines above — without it the budget
      // is satisfiable by collapsing statements onto one line.
      statementsPerLine: 'error',
      // Statement grouping is what a reader (human or agent) reads when
      // deciding where a unit splits.
      statementPadding: 'error',
      importBlock: 'error',
      fixtureImports: 'error',
      cycles: 'error',
      deadCode: 'error',
      usePrefix: 'error',
      testFilename: 'error',
      // warn — composing-only hooks are a known false positive (handbook caveat).
      usePrefixReactivity: 'warn',
      // Attached to .js files only; TS projects are unaffected by construction.
      typedefOnlyFile: 'warn',
      // Deep watch is a Vue cost trap; React has no equivalent call to gate.
      ...(framework === 'vue' ? { deepWatch: 'error' as const } : {}),
    },
    emit: options.emit,
  });
}

/**
 * Canonical Vue blueprint: provide/inject in their layers, Pinia owned by hooks.
 * @group Author
 * @example
 * // blueprint.config.mjs
 * import { vuePreset } from '@kekkai/blueprint';
 *
 * export default vuePreset({ name: 'my-app' });
 */
export function vuePreset(options: PresetOptions = {}): Blueprint {
  return preset(
    'vue',
    {
      hooks: [{ package: 'vue', imports: ['inject'] }, 'pinia'],
      contexts: [{ package: 'vue', imports: ['provide'] }],
    },
    options,
  );
}

/**
 * Canonical React blueprint: createContext/useContext in their layers, Zustand owned by hooks.
 * @group Author
 * @example
 * export default reactPreset({ name: 'my-app' });
 */
export function reactPreset(options: PresetOptions = {}): Blueprint {
  return preset(
    'react',
    {
      hooks: [{ package: 'react', imports: ['useContext'] }, 'zustand'],
      contexts: [{ package: 'react', imports: ['createContext'] }],
    },
    options,
  );
}

/**
 * Canonical Next.js blueprint. The route tree (`app/` and/or `pages/`) is the
 * top layer — flat folder layout, since file-based routing owns its own file
 * names and nesting. No `fetch` ownership: server components fetch everywhere
 * by design, so restricting it to one layer would be a lie. `srcDir` picks the
 * source root (`src` vs the project root, where `app/` sits without --src-dir).
 * @group Author
 * @example
 * export default nextPreset({ router: 'app', srcDir: true });
 */
export function nextPreset(options: NextPresetOptions = {}): Blueprint {
  const router = options.router ?? 'app';
  const routeLayers = router === 'both' ? ['app', 'pages'] : [router];

  return defineBlueprint({
    name: options.name,
    framework: 'react',
    architecture: {
      alias: options.alias ?? '@',
      sourceRoot: options.srcDir ? 'src' : '.',
      layers: [
        ...routeLayers.map((name) => ({
          name,
          does: `Next.js route tree (${name}/): pages, layouts, route handlers, metadata.`,
          mustNot: ['hold reusable UI — extract it to components'],
        })),
        {
          name: 'components',
          does: 'Reusable UI, shared across routes.',
          mustNot: ['own route-level data fetching'],
        },
        {
          name: 'hooks',
          does: 'Client-side state adapters.',
          owns: [{ package: 'react', imports: ['useContext'] }],
        },
        {
          name: 'lib',
          does: 'Framework-free plumbing: data access, formatting, config.',
        },
      ],
      folder: { layout: 'flat', entry: 'index', private: [] },
      naming: {
        hook: 'useX — only when it genuinely uses reactivity',
      },
    },
    principles: principles(),
    componentShape: componentShape(),
    playbook: playbook(),
    rules: {
      maxLines: { tier: 'error', value: 400 },
      maxLinesPerFunction: { tier: 'warn', value: 100 },
      maxParams: { tier: 'warn', value: 3 },
      maxStatements: { tier: 'warn', value: 15 },
      complexity: { tier: 'warn', value: 12 },
      unusedVars: 'error',
      explicitAny: 'error',
      codeStyle: 'error',
      statementsPerLine: 'error',
      statementPadding: 'error',
      importBlock: 'error',
      cycles: 'error',
      usePrefix: 'error',
    },
    emit: options.emit,
  });
}
