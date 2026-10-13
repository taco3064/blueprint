import fs from 'node:fs';
import path from 'node:path';
import { findVariable, getInnermostScope } from '@eslint-community/eslint-utils';
import parser from '@typescript-eslint/parser';
import { resolveDelegate } from './delegate-resolution';
import type { DelegateResolution } from './delegate-resolution';
import type { Scope } from 'eslint';

interface Node {
  type: string;
  name?: string;
  value?: unknown;
  source?: Node;
  declaration?: Node;
  declarations?: Node[];
  specifiers?: Node[];
  local?: Node;
  imported?: Node;
  exported?: Node;
  id?: Node;
  init?: Node;
  callee?: Node;
  object?: Node;
  property?: Node;
  computed?: boolean;
  body?: Node[];
  [key: string]: unknown;
}

interface Module {
  filename: string;
  ast: Node;
  scope: Scope.Scope;
  keys: Record<string, readonly string[] | undefined>;
}

class ExportBinding {
  module: Module;
  node: Node | null;

  constructor(module: Module, node: Node | null) {
    this.module = module;
    this.node = node;
  }
}

type ExportResolution = ExportBinding | null;

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

class Delegation {
  private modules = new Map<string, Module | null>();
  private active = new Set<Node>();
  private exportsActive = new Set<string>();

  private apis: ReadonlySet<string>;
  private resolution: DelegateResolution | undefined;

  constructor(apis: ReadonlySet<string>, resolution?: DelegateResolution) {
    this.apis = apis;
    this.resolution = resolution;
  }

  load(file: string, text?: string): Module | null {
    if (this.modules.has(file)) {
      return this.modules.get(file)!;
    }

    try {
      const parsed = parser.parseForESLint(text ?? fs.readFileSync(file, 'utf8'), {
        filePath: file, ecmaVersion: 'latest', sourceType: 'module',
      });

      const module = {
        filename: file,
        ast: parsed.ast as unknown as Node,
        scope: parsed.scopeManager.globalScope as unknown as Scope.Scope,
        keys: parsed.visitorKeys,
      };

      this.modules.set(file, module);

      return module;
    } catch {
      this.modules.set(file, null);

      return null;
    }
  }

  resolve(module: Module, specifier: string): Module | null {
    const target = resolveDelegate(module.filename, specifier, this.resolution);

    return target === null ? null : this.load(target);
  }

  exported(module: Module, name: string): boolean {
    const binding = this.exportBinding(module, name);

    return binding !== null && this.expression(binding.module, binding.node);
  }

  exportBinding(module: Module, name: string): ExportResolution {
    const key = `${module.filename}:${name}`;

    if (this.exportsActive.has(key)) {
      return null;
    }

    this.exportsActive.add(key);
    const explicit = module.ast.body!.find((statement) => explicitExport(statement, name));

    const binding = explicit
      ? (this.explicitBinding(module, explicit, name) ?? new ExportBinding(module, null))
      : this.starBinding(module, name);

    this.exportsActive.delete(key);

    return binding;
  }

  explicitBinding(module: Module, statement: Node, name: string): ExportResolution {
    if (statement.exportKind === 'type') {
      return null;
    }

    if (statement.type === 'ExportAllDeclaration') {
      return new ExportBinding(module, null);
    }

    const declaration = statement.declaration;

    if (statement.type === 'ExportDefaultDeclaration') {
      return this.localBinding(module, declaration!.id ?? declaration!);
    }

    if (declaration) {
      return this.declarationBinding(module, declaration, name);
    }

    const specifier = statement.specifiers!.find((item) => exportName(item.exported!) === name)!;

    if (specifier.exportKind === 'type') {
      return null;
    }

    if (statement.source) {
      return this.remoteBinding(module, statement.source, specifier.local!.name!);
    }

    return this.localBinding(module, specifier.local!);
  }

  declarationBinding(module: Module, declaration: Node, name: string): ExportResolution {
    const node = declaration.id ?? declaration.declarations!
      .find((item) => bindsName(item.id!, name))!.id!;

    return this.localBinding(module, node);
  }

  remoteBinding(module: Module, source: Node, name: string): ExportResolution {
    const target = this.resolve(module, String(source.value));

    return target ? this.exportBinding(target, name) : null;
  }

  localBinding(module: Module, node: Node): ExportResolution {
    const scope = getInnermostScope(module.scope, node as never);
    const variable = findVariable(scope, node as never);

    const definition = variable?.defs[0];

    if (variable?.references.some((reference) => reference.isWrite() && !reference.init)) {
      return new ExportBinding(module, null);
    }

    if (definition?.type === 'ImportBinding') {
      return this.localImportBinding(module, {
        declaration: definition.node as unknown as Node,
        parent: definition.parent as unknown as Node,
      }, node);
    }

    return new ExportBinding(module, (definition?.name as unknown as Node | undefined) ?? node);
  }

  localImportBinding(
    module: Module,
    binding: { declaration: Node; parent: Node },
    node: Node,
  ): ExportResolution {
    const { declaration, parent } = binding;

    const name = declaration.type === 'ImportDefaultSpecifier'
      ? 'default'
      : declaration.imported?.name;

    if (!name || !validImport(declaration, parent)) {
      return new ExportBinding(module, null);
    }

    const specifier = String(parent.source!.value);

    return specifier === 'react' || specifier === 'vue'
      ? new ExportBinding(module, node)
      : this.remoteBinding(module, parent.source!, name);
  }

  starBinding(module: Module, name: string): ExportResolution {
    let binding: ExportResolution = null;

    if (name === 'default') {
      return null;
    }

    for (const statement of module.ast.body!) {
      if (statement.type !== 'ExportAllDeclaration' || statement.exported
        || statement.exportKind === 'type') {
        continue;
      }

      const candidate = this.remoteBinding(module, statement.source!, name);

      if (candidate && binding && candidate.node !== binding.node) {
        return new ExportBinding(module, null);
      }

      binding = candidate ?? binding;
    }

    return binding;
  }

  imported(module: Module, node: Node, member?: string): boolean {
    const scope = getInnermostScope(module.scope, node as never);
    const variable = findVariable(scope, node as never);

    if (variable?.references.some((reference) => reference.isWrite() && !reference.init)) {
      return false;
    }

    return variable?.defs.some((definition) => {
      const declaration = definition.node as unknown as Node;
      const parent = definition.parent as unknown as Node | null;

      if (definition.type !== 'ImportBinding') {
        if (member || (declaration.type === 'VariableDeclarator'
          && declaration.id!.type !== 'Identifier')) {
          return false;
        }

        return this.expression(module, declaration.init ?? declaration);
      }

      if (!validImport(declaration, parent!, member)) {
        return false;
      }

      return this.importTarget(module, { declaration, parent: parent! }, member);
    }) ?? false;
  }

  importTarget(
    module: Module,
    binding: { declaration: Node; parent: Node },
    member?: string,
  ): boolean {
    const { declaration, parent } = binding;
    const specifier = String(parent!.source!.value);

    const name = member ?? (declaration.type === 'ImportDefaultSpecifier'
      ? 'default'
      : declaration.imported?.name);

    if (!name) {
      return false;
    }

    if (specifier === 'react' || specifier === 'vue') {
      return this.apis.has(name) && (specifier === 'react') === name.startsWith('use');
    }

    const target = this.resolve(module, specifier);

    return target !== null && this.exported(target, name);
  }

  expression(module: Module, node: Node | null): boolean {
    if (!node || this.active.has(node)) {
      return false;
    }

    this.active.add(node);
    let result = false;

    if (node.type === 'Identifier') {
      result = this.imported(module, node);
    } else if (FUNCTIONS.has(node.type)) {
      result = this.calls(module, node, node);
    }

    this.active.delete(node);

    return result;
  }

  memberCall(module: Module, callee: Node): boolean {
    return callee.type === 'MemberExpression' && !callee.computed
      && callee.property!.type === 'Identifier'
      && this.imported(module, callee.object!, callee.property!.name);
  }

  calls(module: Module, node: Node, root: Node): boolean {
    if (node !== root && FUNCTIONS.has(node.type)) {
      return false;
    }

    if (node.type === 'CallExpression') {
      const callee = node.callee!;

      if (this.imported(module, callee)) {
        return true;
      }

      if (this.memberCall(module, callee)) {
        return true;
      }
    }

    return module.keys[node.type]!.some((key) => {
      const value = node[key];
      const children = Array.isArray(value) ? value : [value];

      return children.some((child: unknown) => child !== null && typeof child === 'object'
        && 'type' in child && this.calls(module, child as Node, root));
    });
  }
}

export function delegatedReactivity(
  filename: string,
  source: string,
  options: { apis: ReadonlySet<string>; resolution?: DelegateResolution },
): boolean {
  const delegation = new Delegation(options.apis, options.resolution);
  const module = delegation.load(path.resolve(filename), source);

  return module !== null && module.ast.body!.some((statement) => {
    const declaration = statement.declaration ?? statement;

    return delegation.expression(module, declaration)
      || (declaration.declarations?.some((item) =>
        delegation.expression(module, item.init!)) ?? false);
  });
}

function validImport(declaration: Node, parent: Node, member?: string): boolean {
  return declaration.importKind !== 'type' && parent.importKind !== 'type'
    && (!member
      || ['ImportDefaultSpecifier', 'ImportNamespaceSpecifier'].includes(declaration.type));
}

function explicitExport(statement: Node, name: string): boolean {
  if (statement.type === 'ExportDefaultDeclaration') {
    return name === 'default';
  }

  if (statement.type === 'ExportAllDeclaration') {
    return exportName(statement.exported) === name;
  }

  if (statement.type !== 'ExportNamedDeclaration') {
    return false;
  }

  const declaration = statement.declaration;

  return declaration?.id?.name === name
    || (declaration?.declarations?.some((item) => bindsName(item.id!, name)) ?? false)
    || statement.specifiers!.some((item) => exportName(item.exported!) === name);
}

function exportName(node: Node | undefined): unknown {
  return node?.name ?? node?.value;
}

function bindsName(pattern: Node | null, name: string): boolean {
  if (pattern === null) {
    return false;
  }

  switch (pattern.type) {
    case 'Identifier':
      return pattern.name === name;
    case 'AssignmentPattern':
      return bindsName(pattern.left as Node, name);
    case 'RestElement':
      return bindsName(pattern.argument as Node, name);
    case 'ArrayPattern':
      return (pattern.elements as (Node | null)[]).some((item) => bindsName(item, name));
  }

  return (pattern.properties as Node[]).some((item) =>
    bindsName(item.type === 'RestElement' ? item : item.value as Node, name));
}
