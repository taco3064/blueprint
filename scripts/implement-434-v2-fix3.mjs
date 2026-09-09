import fs from 'node:fs';

function write(file, content) {
  fs.writeFileSync(file, content);
}

function replaceBetween(file, start, end, replacement) {
  const text = fs.readFileSync(file, 'utf8');
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`markers not found in ${file}`);
  fs.writeFileSync(file, text.slice(0, a) + replacement + text.slice(b));
}

write('src/emit/lint/structural.ts', `import { aliasSpecifier } from '../../config';
import type { AliasRoot } from '../../config';
import type { GroupPattern } from './types';

export function buildStructuralPatterns(params: {
  layer: string;
  module?: string;
  modules?: string[];
  aliases: (AliasRoot | string)[];
  forbidden: string[];
  unitLayout: 'folder' | 'file';
  folderTargets?: string[];
  fixtures?: string[];
}): GroupPattern[] {
  const {
    layer,
    module,
    modules = [],
    aliases,
    forbidden,
    unitLayout,
    folderTargets,
    fixtures,
  } = params;

  const targetModules: (string | undefined)[] = module === undefined
    ? [undefined]
    : modules.length ? modules : [module];

  const sameLayer = specifiers(aliases, layer, [module]);

  const patterns: GroupPattern[] = [{
    group: ['./../**', '././**'],
    message: '\n🚫 Redundant relative segments (././, ./../) bypass the structural import rules.',
  }, ...sameLayer.map((specifier) => {
    const head = `\n🚫 Same-layer imports must be relative. "${specifier}" and everything under it `
      + `is banned. Replace "${specifier}/X" with `;

    return {
      group: [specifier, `${specifier}/**`],
      message: unitLayout === 'file'
        ? `${head}"./X".`
        : `${head}"../X" — its entry only; what is behind the entry stays private.`,
    };
  })];

  if (forbidden.length) {
    patterns.push({
      group: forbidden.flatMap((banned) =>
        specifiers(aliases, banned, targetModules).flatMap((specifier) => [
          specifier,
          `${specifier}/**`,
        ]),
      ),
      message: '\n🚫 This import violates the dependency flow. '
        + 'Only import from allowed lower layers.',
    });
  }

  if (fixtures?.length) {
    patterns.push({
      group: fixtures,
      message: '\n🚫 Production code must not import fixtures — '
        + 'missing data renders empty or error, '
        + 'never fake.',
    });
  }

  if (folderTargets?.length) {
    patterns.push({
      group: folderTargets.flatMap((target) =>
        specifiers(aliases, target, targetModules).map((specifier) => `${specifier}/*/**`),
      ),
      message: '\n🚫 Import a unit through its entry, not its internals.',
    });
  }

  return patterns;
}

function specifiers(
  aliases: (AliasRoot | string)[],
  layer: string,
  modules: (string | undefined)[],
): string[] {
  return modules.flatMap((module) =>
    aliases.flatMap((alias) => aliasSpecifier(alias, layer, module) ?? []),
  );
}
`);

replaceBetween(
  'src/emit/lint/lint.ts',
  'function layerImportEntries(',
  'function ruleGateEntries(',
  `function layerImportEntries(
  blueprint: Blueprint,
  shape: {
    severity: Severity;
    testGlobs: string[];
    aliases: AliasRoot[];
    layouts: Record<string, UnitLayout>;
  },
): LintConfigEntry[] {
  const { framework, architecture } = blueprint;
  const resolved = resolveArchitecture(architecture);
  const layers = resolved.layers.map((layer) => layer.definition);
  const { severity, testGlobs, aliases, layouts } = shape;
  const packageRules = derivePackageRules(layers);
  const globalRules = deriveGlobalRules(layers);
  const scopes: (string | undefined)[] = resolved.moduleFirst
    ? resolved.moduleNames
    : [undefined];

  const folderLayers = layers
    .map((layer) => layer.name)
    .filter((name) => layouts[name] === 'folder');

  const fixtures = activeSetting(blueprint.rules?.fixtureImports)
    ? aliases.flatMap((root) => {
        const alias = [root.alias, ...root.prefix].join('/');

        return root.prepend?.length ? [] : [\`${'${alias}'}/fixtures\`, \`${'${alias}'}/fixtures/**\`];
      })
    : [];

  return scopes.flatMap((module) => layers.flatMap((layer) => {
    const files = module === undefined
      ? resolved.layerFiles(layer.name, framework)
      : resolved.moduleLayerFiles(module, layer.name, framework);

    const forbidden = resolved.forbiddenLayers(layer.name);
    const disabledPackages = packageRules.filter((rule) => !rule.allowedIn.includes(layer.name));
    const disabledGlobals = globalRules.filter((rule) => !rule.allowedIn.includes(layer.name));
    const selfOnlyTargets = resolved.selfOnlyTargets(layer.name);

    const structural = buildStructuralPatterns({
      layer: layer.name,
      module,
      modules: resolved.moduleNames,
      aliases,
      forbidden,
      unitLayout: layouts[layer.name],
      folderTargets: folderLayers.filter(
        (name) => name !== layer.name && !forbidden.includes(name),
      ),
      fixtures,
    });

    const syntaxModules: (string | undefined)[] = resolved.moduleFirst
      ? resolved.moduleNames
      : [undefined];

    const syntaxRules = selfOnlyTargets.flatMap((target) =>
      syntaxModules.flatMap((targetModule) => aliases.flatMap((alias) => {
        const specifier = aliasSpecifier(alias, target, targetModule);

        return specifier === null
          ? []
          : [{
              selector: selfOnlyReexportSelector(specifier),
              message: \`\\n🚫 Cannot re-export from "\${target}" — a selfOnly dependency must not be exposed to callers.\`,
            }];
      })),
    );

    const buildRules = (packages: PackageRule[]): Linter.RulesRecord => {
      const { paths, patterns } = buildPackagePatterns(packages);

      return {
        ...(layer.lintOverrides as Linter.RulesRecord),
        'no-restricted-imports': [
          severity,
          { patterns: [...structural, ...patterns], ...(paths.length ? { paths } : {}) },
        ],
        ...(syntaxRules.length ? { 'no-restricted-syntax': [severity, ...syntaxRules] } : {}),
        ...buildGlobalRule(disabledGlobals, severity),
      };
    };

    const exemptPatterns = [
      ...new Set(disabledPackages.flatMap((rule) => rule.exempt ?? []).filter(Boolean)),
    ];

    if (!exemptPatterns.length) {
      return [{ files, ignores: testGlobs, rules: buildRules(disabledPackages) }];
    }

    const nonExempt = disabledPackages.filter((rule) => !rule.exempt?.length);

    return [
      { files, ignores: testGlobs, rules: buildRules(nonExempt) },
      { files, ignores: [...exemptPatterns, ...testGlobs], rules: buildRules(disabledPackages) },
    ];
  }));
}

`,
);

{
  const file = 'src/emit/lint/lint.ts';
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(
    " * enforces the one-way dependency flow, module-entry boundaries, and package",
    " * enforces the one-way dependency flow, unit-entry boundaries, and package",
  );
  text = text.replace(
    `{ layouts, entries, sourceRoot: resolved.sourceRoot },`,
    `{ architecture },`,
  );
  fs.writeFileSync(file, text);
}

write('src/plugin/relative-escape.ts', `import path from 'node:path';
import type { Rule } from 'eslint';
import type { ArchitectureDef } from '../config';
import { resolveArchitecture } from '../config';
import { resolveSegments } from './relative';

export const relativeEscape: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Relative imports preserve the resolved module/layer/unit boundary.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          architecture: { type: 'object', additionalProperties: true },
        },
        required: ['architecture'],
        additionalProperties: false,
      },
    ],
    messages: {
      escapesSrc: '🚫 Relative import "{{specifier}}" escapes {{sourceRoot}} — use the project alias.',
      leavesLayer:
        '🚫 Relative import "{{specifier}}" leaves this layer — use the alias, or extract shared code to a lower layer.',
      reachesInside:
        '🚫 Relative import "{{specifier}}" reaches past a sibling unit entry — import "{{entry}}" instead.',
    },
  },
  create(context) {
    const architecture = (context.options[0] as { architecture?: ArchitectureDef } | undefined)
      ?.architecture;

    if (!architecture) {
      return {};
    }

    const resolved = resolveArchitecture(architecture);
    const cwd = (context as Rule.RuleContext & { cwd: string }).cwd;
    const segments = sourceSegments(context.filename, cwd, resolved.sourceRoot);

    if (!segments) {
      return {};
    }

    const own = resolved.classify(segments);

    if (!own.layer || own.inner !== 'layer') {
      return {};
    }

    const dir = segments.slice(0, -1);

    const check = (node: Rule.Node, specifier: string): void => {
      if (!specifier.startsWith('.')) {
        return;
      }

      const targetSegments = resolveSegments(dir, specifier);

      if (targetSegments === null) {
        context.report({
          node,
          messageId: 'escapesSrc',
          data: {
            specifier,
            sourceRoot: resolved.sourceRoot === '.' ? 'the project root' : \`${'${resolved.sourceRoot}'}/\`,
          },
        });
        return;
      }

      const target = resolved.classify(targetSegments);
      const ownModule = own.module?.name ?? null;
      const targetModule = target.module?.name ?? null;

      // #435 owns the cross-module relative-import policy. #434 keeps the
      // existing inner unit/layer rule and deliberately does not invent one.
      if (resolved.moduleFirst && ownModule !== targetModule) {
        return;
      }

      if (!target.layer || target.layer.name !== own.layer.name) {
        context.report({ node, messageId: 'leavesLayer', data: { specifier } });
        return;
      }

      if (own.layer.unit.layout === 'file' || target.unit === own.unit) {
        return;
      }

      const withinLayer = resolved.moduleFirst
        ? target.path.slice(2)
        : target.path.slice(1);
      const entry = own.layer.unit.entry;
      const atEntry = withinLayer.length === 1
        || (withinLayer.length === 2 && stripExtension(withinLayer[1]) === entry);

      if (!atEntry) {
        context.report({ node, messageId: 'reachesInside', data: { specifier, entry } });
      }
    };

    const fromSource = (node: Rule.Node): void => {
      const { source } = node as { source?: { type?: string; value?: unknown } | null };

      if (source?.type === 'Literal' && typeof source.value === 'string') {
        check(node, source.value);
      }
    };

    return {
      ImportDeclaration: fromSource,
      ExportNamedDeclaration: fromSource,
      ExportAllDeclaration: fromSource,
      ImportExpression: fromSource,
    };
  },
};

export function sourceSegments(
  filename: string,
  cwd: string,
  sourceRoot: string,
): string[] | null {
  const relative = path.isAbsolute(filename) ? path.relative(cwd, filename) : filename;
  const parts = relative.split(/[\\\\/]/).filter((part) => part !== '' && part !== '.');
  const root = sourceRoot.split(/[\\\\/]/).filter((part) => part !== '' && part !== '.');

  if (!root.length) {
    return parts[0] === '..' ? null : parts;
  }

  for (let at = parts.length - root.length; at >= 0; at -= 1) {
    if (root.every((part, index) => parts[at + index] === part)) {
      return parts.slice(at + root.length);
    }
  }

  return null;
}

function stripExtension(value: string): string {
  return value.replace(/\\.[^.]+$/, '');
}
`);

// React/Vue keep their 3.2 folder-unit behavior; Next stays file-based.
{
  const file = 'src/presets/presets.ts';
  let text = fs.readFileSync(file, 'utf8');
  const marker = 'export function nextPreset';
  const at = text.indexOf(marker);
  if (at < 0) throw new Error('nextPreset marker missing');
  const before = text.slice(0, at);
  let next = text.slice(at);
  next = next.replace(/\n\s+layout: 'folder',(?=\n\s+does:)/g, '');
  text = before + next;
  fs.writeFileSync(file, text);
}
