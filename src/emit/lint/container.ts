import type { Linter } from 'eslint';

import { activeSetting, resolveArchitecture } from '../../config';
import type { AliasRoot, Blueprint } from '../../config';
import { buildContainerPatterns } from './structural';
import { buildPackagePatterns, deriveGlobalRules, derivePackageRules } from './patterns';
import type { GlobalRule, LintConfigEntry, PackageRule } from './types';

export function containerImportEntries(
  blueprint: Blueprint,
  scope: {
    severity: 'error' | 'warn';
    testGlobs: string[];
    aliases: AliasRoot[];
    layouts: Record<string, 'folder' | 'file'>;
  },
): LintConfigEntry[] {
  const { architecture, framework } = blueprint;
  const resolved = resolveArchitecture(architecture);

  if (resolved.topology !== 'module-first') {
    return [];
  }

  const packageRules = derivePackageRules(architecture.layers);
  const globalRules = deriveGlobalRules(architecture.layers);
  const folderTargets = resolved.layerNames.filter((layer) => scope.layouts[layer] === 'folder');

  const fixtures = activeSetting(blueprint.rules?.fixtureImports)
    ? scope.aliases.flatMap((root) => root.prepend?.length
        ? []
        : [`${[root.alias, ...root.prefix].join('/')}/fixtures`,
            `${[root.alias, ...root.prefix].join('/')}/fixtures/**`])
    : [];

  const files = resolved.containerFiles(framework);

  return resolved.modules.flatMap((module, index) => containerEntriesForModule({
    module: module.name,
    files: [files[index]],
    aliases: scope.aliases,
    folderTargets,
    fixtures,
    packageRules,
    globalRules,
    severity: scope.severity,
    testGlobs: scope.testGlobs,
  }));
}

function containerEntriesForModule(scope: {
  module: string;
  files: string[];
  aliases: AliasRoot[];
  folderTargets: string[];
  fixtures: string[];
  packageRules: PackageRule[];
  globalRules: GlobalRule[];
  severity: 'error' | 'warn';
  testGlobs: string[];
}): LintConfigEntry[] {
  const structural = buildContainerPatterns(scope);
  const exempt = [...new Set(scope.packageRules.flatMap((rule) => rule.exempt ?? []))];

  const buildRules = (packages: PackageRule[]): Linter.RulesRecord => {
    const { paths, patterns } = buildPackagePatterns(packages);

    return {
      'no-restricted-imports': [
        scope.severity,
        { patterns: [...structural, ...patterns], ...(paths.length ? { paths } : {}) },
      ],
      ...buildGlobalRule(scope.globalRules, scope.severity),
    };
  };

  if (!exempt.length) {
    return [{
      files: scope.files,
      ignores: scope.testGlobs,
      rules: buildRules(scope.packageRules),
    }];
  }

  const nonExempt = scope.packageRules.filter((rule) => !rule.exempt?.length);

  return [
    { files: scope.files, ignores: scope.testGlobs, rules: buildRules(nonExempt) },
    {
      files: scope.files,
      ignores: [...exempt, ...scope.testGlobs],
      rules: buildRules(scope.packageRules),
    },
  ];
}

export function buildGlobalRule(
  rules: GlobalRule[],
  severity: 'error' | 'warn',
): Linter.RulesRecord {
  return rules.length
    ? {
        'no-restricted-globals': [severity, ...rules.map((rule) => ({
          name: rule.global,
          message: `\n🚫 Use of "${rule.global}" is restricted to its owning layer.`,
        }))],
      }
    : {};
}
