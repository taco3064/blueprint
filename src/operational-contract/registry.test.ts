import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { OPERATIONAL_SURFACES } from './registry';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../..');

const supportFiles = new Set([
  'authoring-types.ts',
  'index.ts',
  'operational-contract.ts',
  'registry.ts',
]);

function productionFiles(directoryPath: string): string[] {
  return fs.readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      return productionFiles(absolute);
    }

    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [absolute]
      : [];
  });
}

function isMutantInstrumented(file: string): boolean {
  return fs.readFileSync(file, 'utf8').includes('stryMutAct_');
}

function compilerProgram(): ts.Program {
  const configFile = ts.readConfigFile(
    path.join(repository, 'tsconfig.test.json'),
    ts.sys.readFile,
  );

  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repository);

  return ts.createProgram(config.fileNames, config.options);
}

function compilerProgramWithSource(file: string, text: string): ts.Program {
  const configFile = ts.readConfigFile(
    path.join(repository, 'tsconfig.test.json'),
    ts.sys.readFile,
  );

  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repository);
  const host = ts.createCompilerHost(config.options);
  const absolute = path.resolve(file);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);

  host.fileExists = (candidate) => path.resolve(candidate) === absolute
    || originalFileExists(candidate);

  host.readFile = (candidate) => path.resolve(candidate) === absolute
    ? text
    : originalReadFile(candidate);

  return ts.createProgram([...config.fileNames, absolute], config.options, host);
}

function operationalTextType(program: ts.Program): ts.Type {
  const source = program.getSourceFile(path.join(directory, 'operational-contract.ts'))!;

  const declaration = source.statements.find(
    (node): node is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(node) && node.name.text === 'OperationalText',
  )!;

  return program.getTypeChecker().getTypeAtLocation(declaration.name);
}

function centralBindings(source: ts.SourceFile): Set<string> {
  return new Set(source.statements.flatMap((node) => {
    if (!ts.isImportDeclaration(node)
      || !ts.isStringLiteral(node.moduleSpecifier)
      || path.resolve(path.dirname(source.fileName), node.moduleSpecifier.text) !== directory) {
      return [];
    }

    const bindings = node.importClause?.namedBindings;

    return bindings && ts.isNamedImports(bindings)
      ? bindings.elements.map((element) => element.name.text)
      : [];
  }));
}

function isOutputSink(node: ts.CallExpression): boolean {
  if (ts.isIdentifier(node.expression)) {
    return node.expression.text === 'log';
  }

  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  return node.expression.name.text === 'log'
    || (ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'console'
      && ['error', 'warn'].includes(node.expression.name.text));
}

function isMachineOutput(node: ts.Expression, checker?: ts.TypeChecker): boolean {
  if (!ts.isCallExpression(node)
    || !ts.isPropertyAccessExpression(node.expression)
    || !ts.isIdentifier(node.expression.expression)
    || node.expression.expression.text !== 'JSON'
    || node.expression.name.text !== 'stringify') {
    return false;
  }

  const value = node.arguments[0];

  if (value === undefined || ts.isStringLiteralLike(value)) {
    return false;
  }

  return checker === undefined
    || (checker.getTypeAtLocation(value).flags & ts.TypeFlags.StringLike) === 0;
}

function isForwardedConsoleParameter(node: ts.CallExpression): boolean {
  const argument = node.arguments[0];

  if (!ts.isIdentifier(argument)) {
    return false;
  }

  const arrow = node.parent;

  return ts.isArrowFunction(arrow)
    && arrow.body === node
    && arrow.parameters.length === 1
    && ts.isIdentifier(arrow.parameters[0].name)
    && arrow.parameters[0].name.text === argument.text;
}

interface SinkContext {
  bindings: Set<string>;
  checker?: ts.TypeChecker;
  operational?: ts.Type;
}

function isCentralRendererCall(node: ts.Expression, context: SinkContext): boolean {
  if (!ts.isCallExpression(node)) {
    return false;
  }

  if (ts.isIdentifier(node.expression) && context.bindings.has(node.expression.text)) {
    return true;
  }

  return context.checker !== undefined
    && context.operational !== undefined
    && context.checker.isTypeAssignableTo(
      context.checker.getTypeAtLocation(node),
      context.operational,
    );
}

function isGovernedExpression(node: ts.Expression, context: SinkContext): boolean {
  if (ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)) {
    return isGovernedExpression(node.expression, context);
  }

  if (ts.isConditionalExpression(node)) {
    return isGovernedExpression(node.whenTrue, context)
      && isGovernedExpression(node.whenFalse, context);
  }

  if (isMachineOutput(node, context.checker) || isCentralRendererCall(node, context)) {
    return true;
  }

  return context.checker !== undefined
    && context.operational !== undefined
    && context.checker.isTypeAssignableTo(
      context.checker.getTypeAtLocation(node),
      context.operational,
    );
}

function violationAt(source: ts.SourceFile, node: ts.Node): string {
  const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;

  return `${source.fileName}:${line}`;
}

function deepImportViolation(node: ts.Node, source: ts.SourceFile): string | null {
  if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) {
    return null;
  }

  const target = path.resolve(path.dirname(source.fileName), node.moduleSpecifier.text);

  return target === path.join(directory, 'operational-contract')
    ? violationAt(source, node)
    : null;
}

function brandAssertionViolation(
  node: ts.Node,
  source: ts.SourceFile,
  context: SinkContext,
): string | null {
  if (!ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node)) {
    return null;
  }

  const asserted = context.checker?.getTypeAtLocation(node.type);

  const resolvesToOperational = asserted !== undefined
    && context.checker !== undefined
    && context.operational !== undefined
    && context.checker.isTypeAssignableTo(asserted, context.operational)
    && context.checker.isTypeAssignableTo(context.operational, asserted);

  return resolvesToOperational
    || (context.checker === undefined && node.type.getText() === 'OperationalText')
    ? violationAt(source, node)
    : null;
}

function outputSinkViolation(
  node: ts.Node,
  source: ts.SourceFile,
  context: SinkContext,
): string | null {
  if (!ts.isCallExpression(node) || !isOutputSink(node)) {
    return null;
  }

  const argument = node.arguments[0];

  return argument !== undefined
    && !isGovernedExpression(argument, context)
    && !isForwardedConsoleParameter(node)
    ? violationAt(source, argument)
    : null;
}

function noteViolation(
  node: ts.Node,
  source: ts.SourceFile,
  context: SinkContext,
): string | null {
  if (!ts.isPropertyAssignment(node)) {
    return null;
  }

  const note = (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
    && node.name.text === 'note';

  return note && !isGovernedExpression(node.initializer, context)
    ? violationAt(source, node.initializer)
    : null;
}

function errorViolation(
  node: ts.Node,
  source: ts.SourceFile,
  context: SinkContext,
): string | null {
  if (!ts.isNewExpression(node)
    || !ts.isIdentifier(node.expression)
    || node.expression.text !== 'Error') {
    return null;
  }

  const argument = node.arguments?.[0];

  return argument !== undefined && !isGovernedExpression(argument, context)
    ? violationAt(source, argument)
    : null;
}

function sinkViolations(
  source: ts.SourceFile,
  checker?: ts.TypeChecker,
  operational?: ts.Type,
): string[] {
  const violations: string[] = [];
  const context = { bindings: centralBindings(source), checker, operational };

  const visit = (node: ts.Node): void => {
    const found = [
      deepImportViolation(node, source),
      brandAssertionViolation(node, source, context),
      outputSinkViolation(node, source, context),
      noteViolation(node, source, context),
      errorViolation(node, source, context),
    ].filter((violation): violation is string => violation !== null);

    violations.push(...found);

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);

  return violations;
}

describe('operational surface registry', () => {
  it('registers every production renderer owner exactly once', () => {
    const productionOwners = fs.readdirSync(directory)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => !file.endsWith('.test.ts') && !supportFiles.has(file))
      .sort();

    const registeredOwners = OPERATIONAL_SURFACES.map(({ owner }) => owner).sort();

    expect(registeredOwners).toEqual(productionOwners);

    expect(new Set(OPERATIONAL_SURFACES.map(({ id }) => id)).size)
      .toBe(OPERATIONAL_SURFACES.length);
  });

  it('points only at existing consumers and declares verification', () => {
    for (const surface of OPERATIONAL_SURFACES) {
      expect(surface.consumers.length, surface.id).toBeGreaterThan(0);
      expect(surface.targets.length, surface.id).toBeGreaterThan(0);
      expect(surface.verification.length, surface.id).toBeGreaterThan(0);

      for (const consumer of surface.consumers) {
        expect(fs.existsSync(path.join(repository, consumer)), `${surface.id}: ${consumer}`).toBe(true);
      }
    }
  });

  it('matches every production consumer of the governed boundary', () => {
    const actualConsumers = productionFiles(path.join(repository, 'src'))
      .filter((file) => !file.startsWith(directory))
      .filter((file) => /from ['"](?:\.\.\/)+operational-contract(?:\/|['"])/
        .test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(repository, file).split(path.sep).join('/'))
      .sort();

    const registeredConsumers = [...new Set(
      OPERATIONAL_SURFACES.flatMap(({ consumers }) => consumers)
        .filter((file) => file.startsWith('src/')),
    )].sort();

    expect(registeredConsumers).toEqual(actualConsumers);
  });

  it('keeps the contract below high-level policy modules', () => {
    for (const surface of OPERATIONAL_SURFACES) {
      const source = fs.readFileSync(path.join(directory, surface.owner), 'utf8');

      expect(source, surface.id).not.toMatch(/from ['"]\.\.\/(?:bootstrap|inspect|project)(?:\/|['"])/);
    }
  });

  it('keeps domain validation fact providers below the operational contract', () => {
    const providers = ['config', 'markdown'].flatMap((area) =>
      productionFiles(path.join(repository, 'src', area)),
    );

    for (const file of providers) {
      expect(fs.readFileSync(file, 'utf8'), path.relative(repository, file))
        .not.toMatch(/from ['"](?:\.\.\/)+operational-contract(?:\/|['"])/);
    }
  });

  it('closes every production output sink regardless of imports or prose length', () => {
    const program = compilerProgram();
    const checker = program.getTypeChecker();
    const operational = operationalTextType(program);

    const violations = productionFiles(path.join(repository, 'src'))
      .filter((file) => !file.startsWith(directory) && !isMutantInstrumented(file))
      .flatMap((file) => sinkViolations(program.getSourceFile(file)!, checker, operational));

    expect(violations.join('\n')).toBe('');
  });
});

describe('operational sink bypass guard', () => {
  it('rejects short, split, and indirect prose at an unregistered sink', () => {
    const source = ts.createSourceFile(
      'unregistered.ts',
      [
        'const indirect = "third";',
        'log("short");',
        'log("first" + "second");',
        'log(indirect);',
        'const action = { note: "fourth" };',
        'log(JSON.stringify("fifth"));',
        'throw new Error("sixth");',
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
    );

    expect(sinkViolations(source)).toEqual([
      'unregistered.ts:2',
      'unregistered.ts:3',
      'unregistered.ts:4',
      'unregistered.ts:5',
      'unregistered.ts:6',
      'unregistered.ts:7',
    ]);
  });

  it('rejects deep-import access to the operational text brand', () => {
    const source = ts.createSourceFile(
      path.join(repository, 'src/unregistered.ts'),
      [
        'import { operationalText } from \'./operational-contract/operational-contract\';',
        'log(operationalText(\'local prose\'));',
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
    );

    expect(sinkViolations(source)).toEqual([
      `${source.fileName}:1`,
      `${source.fileName}:2`,
    ]);
  });

  it('does not exempt config or markdown domain errors from central ownership', () => {
    for (const area of ['config', 'markdown']) {
      const source = ts.createSourceFile(
        path.join(repository, `src/${area}/rogue.ts`),
        'throw new Error("local prose");',
        ts.ScriptTarget.Latest,
        true,
      );

      expect(sinkViolations(source)).toEqual([`${source.fileName}:1`]);
    }
  });

  it('rejects forging the operational text brand through an aliased type', () => {
    const file = path.join(repository, 'src/unregistered.ts');

    const text = [
      'import type { OperationalText as OT } from \'./operational-contract\';',
      'const forged = \'local prose\' as OT;',
      'log(forged);',
    ].join('\n');

    const program = compilerProgramWithSource(file, text);
    const source = program.getSourceFile(file)!;
    const checker = program.getTypeChecker();

    expect(sinkViolations(source, checker, operationalTextType(program))).toEqual([
      `${source.fileName}:2`,
    ]);
  });
});
