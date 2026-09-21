import { createRequire } from 'node:module';
import { findVariable, getInnermostScope, getStaticValue } from '@eslint-community/eslint-utils';
import tsParser from '@typescript-eslint/parser';
import type { Scope } from 'eslint';

const vueParser = createRequire(import.meta.url)('blueprint-vue-parser') as {
  parseForESLint: (source: string, options: object) => unknown;
};

interface AstNode {
  type: string;
  [key: string]: unknown;
}

interface ParsedSource {
  ast: AstNode;
  scopeManager: {
    globalScope: Scope.Scope | null;
  };
  visitorKeys: Record<string, string[]>;
}

export interface DynamicImportAnalysis {
  specifiers: string[];
  unknown: number;
  parseError?: string;
}

export interface ModuleImportAnalysis {
  specifiers: string[];
  parseError?: string;
}

const vueJsxParser = {
  parseForESLint(
    source: string,
    options: Parameters<typeof tsParser.parseForESLint>[1],
  ): ReturnType<typeof tsParser.parseForESLint> {
    return tsParser.parseForESLint(source, { ...options, jsx: true });
  },
};

const vueScriptParsers = {
  js: tsParser,
  jsx: vueJsxParser,
  ts: tsParser,
  tsx: vueJsxParser,
  '<template>': tsParser,
};

export function staticImportSpecifier(node: AstNode, scope: Scope.Scope | null): string | null {
  const found = getStaticValue(node as never, scope);

  return typeof found?.value === 'string' ? found.value : null;
}

export function analyzeDynamicImports(
  source: string,
  filePath = 'source.js',
): DynamicImportAnalysis {
  let parsed: ParsedSource;

  try {
    parsed = parseSource(source, filePath);
  } catch (error) {
    return {
      specifiers: [],
      unknown: 0,
      parseError: String(error),
    };
  }

  const result: DynamicImportAnalysis = { specifiers: [], unknown: 0 };
  const globalScope = parsed.scopeManager.globalScope;

  walk(parsed.ast, parsed.visitorKeys, (node) => {
    if (node.type !== 'ImportExpression') {
      return;
    }

    const sourceNode = node.source as AstNode;
    const scope = getInnermostScope(globalScope!, sourceNode as never);
    const specifier = staticImportSpecifier(sourceNode, scope);

    if (specifier === null) {
      result.unknown++;
    } else {
      result.specifiers.push(specifier);
    }
  });

  return result;
}

export function analyzeModuleImports(source: string, filePath = 'source.js'): ModuleImportAnalysis {
  let parsed: ParsedSource;

  try {
    parsed = parseSource(source, filePath);
  } catch (error) {
    return { specifiers: [], parseError: String(error) };
  }

  const specifiers: string[] = [];
  const globalScope = parsed.scopeManager.globalScope!;

  walk(parsed.ast, parsed.visitorKeys, (node) => {
    const sourceNode = moduleSpecifier(node, globalScope);

    if (sourceNode === null) {
      return;
    }

    const scope = getInnermostScope(globalScope, sourceNode as never);
    const specifier = staticImportSpecifier(sourceNode, scope);

    if (specifier !== null) {
      specifiers.push(specifier);
    }
  });

  return { specifiers };
}

function parseSource(source: string, filePath: string): ParsedSource {
  const options = {
    // Stryker disable next-line BooleanLiteral: dependency discovery ignores parser comments.
    comment: true,
    ecmaVersion: 'latest' as const,
    filePath,
    // Stryker disable next-line Regex: filePath selects JSX/TSX; this mirrors that context.
    jsx: /\.[jt]sx$/.test(filePath),
    // Stryker disable next-line BooleanLiteral: dependency discovery never consumes node locations.
    loc: true,
    range: true,
    sourceType: 'module' as const,
    // Stryker disable next-line BooleanLiteral: dependency discovery never consumes parser tokens.
    tokens: true,
  };

  return (filePath.endsWith('.vue')
    ? vueParser.parseForESLint(source, { ...options, parser: vueScriptParsers })
    : tsParser.parseForESLint(source, options)) as unknown as ParsedSource;
}

function walk(
  node: AstNode,
  visitorKeys: Record<string, string[]>,
  visit: (node: AstNode) => void,
): void {
  visit(node);

  for (const key of visitorKeys[node.type] as string[]) {
    const child = node[key];

    if (Array.isArray(child)) {
      for (const item of child) {
        if (isNode(item)) {
          walk(item, visitorKeys, visit);
        }
      }
    } else if (isNode(child)) {
      walk(child, visitorKeys, visit);
    }
  }
}

function isNode(value: unknown): value is AstNode {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }

  // Stryker disable next-line ConditionalExpression: parser visitor nodes guarantee string types.
  return typeof value.type === 'string';
}

export function transformationMemberIdentity(source: string, filePath: string): string | null {
  const normalized = source.replace(/\r\n/g, '\n');
  let parsed: ParsedSource;

  try {
    parsed = parseSource(normalized, filePath);
  } catch {
    return null;
  }

  const ranges: [number, number][] = [];

  walk(parsed.ast, parsed.visitorKeys, (node) => {
    const specifier = memberModuleSpecifier(node, parsed.scopeManager.globalScope!);

    if (specifier?.type === 'Literal' && typeof specifier.value === 'string') {
      ranges.push(specifier.range as [number, number]);
    }
  });

  return ranges.sort((left, right) => right[0] - left[0]).reduce(
    (value, [start, end]) => `${value.slice(0, start)}'__module__'${value.slice(end)}`,
    normalized,
  );
}

function memberModuleSpecifier(node: AstNode, globalScope: Scope.Scope): AstNode | null {
  if ([
    'ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression',
  ].includes(node.type)) {
    return node.source as AstNode;
  }

  if (node.type === 'TSExternalModuleReference') {
    return node.expression as AstNode;
  }

  if (node.type !== 'CallExpression') {
    return null;
  }

  const callee = node.callee as AstNode;
  const args = node.arguments as AstNode[];

  // Only Identifier callees carry a name; other expressions fail this comparison.
  if (callee.name !== 'require' || args.length !== 1 || node.optional) {
    return null;
  }

  const scope = getInnermostScope(globalScope, callee as never);

  return findVariable(scope, callee as never) === null ? args[0] : null;
}

function moduleSpecifier(node: AstNode, globalScope: Scope.Scope): AstNode | null {
  if (node.type === 'TSImportType') {
    return node.source as AstNode;
  }

  return memberModuleSpecifier(node, globalScope);
}
