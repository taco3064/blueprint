import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const API = 'docs/api';

export const SUBPATH_CONTROLS = {
  '@kekkai/blueprint/operational-contract': 'OPERATIONAL_SURFACES',
};

export function entryPoints(pkg) {
  return Object.entries(pkg.exports)
    .filter(([, target]) => typeof target?.types === 'string')
    .map(([key, target]) => ({
      specifier: `${pkg.name}${key.slice(1)}`,
      source: target.types.replace(/^\.\/dist\//, 'src/').replace(/\.d\.ts$/, '.ts'),
      page: key === '.' ? 'index.md' : `${pkg.name}${key.slice(1)}/index.md`,
      root: key === '.',
    }));
}

function sections(markdown) {
  const result = new Map();
  let current = null;

  for (const line of markdown.split('\n')) {
    const heading = line.match(/^## (.+)$/);
    const item = line.match(/^- \[(.+?)\]\(.+?\)$/) ?? line.match(/^### (.+)$/);

    if (heading) {
      current = heading[1];
      result.set(current, []);
    } else if (item && current) {
      result.get(current).push(item[1].replaceAll('\\', '').replaceAll('~~', ''));
    }
  }

  return result;
}

export function documentedModules(markdown) {
  return sections(markdown).get('Modules') ?? [];
}

export function documentedSymbols(markdown) {
  return [...sections(markdown)]
    .filter(([heading]) => heading !== 'Modules')
    .flatMap(([, names]) => names);
}

export function exportedNames(sources) {
  const config = ts.getParsedCommandLineOfConfigFile('tsconfig.typedoc.json', {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    },
  });

  const program = ts.createProgram(sources, config.options);
  const checker = program.getTypeChecker();

  return Object.fromEntries(sources.map((source) => {
    const file = program.getSourceFile(path.resolve(source));
    const symbols = checker.getExportsOfModule(checker.getSymbolAtLocation(file));

    return [source, symbols.map((symbol) => symbol.name).sort()];
  }));
}

function difference(left, right) {
  return left.filter((name) => !right.includes(name));
}

export function apiReferenceProblems({ entries, exportsOf, readPage }) {
  const problems = [];
  const root = entries.find((entry) => entry.root);
  const rootPage = readPage(root.page);

  if (rootPage === undefined) {
    return [`${root.specifier} has no API index at ${root.page}.`];
  }

  if (!rootPage.startsWith(`# ${root.specifier}\n`)) {
    problems.push(`${root.page} must be titled "# ${root.specifier}" without a version.`);
  }

  const subpaths = entries.filter((entry) => !entry.root);
  const modules = documentedModules(rootPage);

  for (const entry of subpaths.filter((candidate) => !modules.includes(candidate.specifier))) {
    problems.push(`${entry.specifier} is a package export with no API module.`);
  }

  for (const name of difference(modules, subpaths.map((entry) => entry.specifier))) {
    problems.push(`The API documents module ${name}, which is not a package export.`);
  }

  const rootDocumented = documentedSymbols(rootPage);

  if (rootDocumented.length === 0) {
    problems.push(`${root.specifier} documents no symbols.`);
  }

  for (const name of difference(rootDocumented, exportsOf[root.source])) {
    problems.push(`${root.specifier} documents ${name}, which it does not export.`);
  }

  for (const entry of subpaths) {
    const page = readPage(entry.page);

    if (page === undefined) {
      problems.push(`${entry.specifier} has no API page at ${entry.page}.`);

      continue;
    }

    const documented = documentedSymbols(page);
    const exported = exportsOf[entry.source];

    for (const name of difference(exported, documented)) {
      problems.push(`${entry.specifier} exports ${name}, which its API page omits.`);
    }

    for (const name of difference(documented, exported)) {
      problems.push(`${entry.specifier} documents ${name}, which it does not export.`);
    }
  }

  for (const [specifier, symbol] of Object.entries(SUBPATH_CONTROLS)) {
    const entry = subpaths.find((candidate) => candidate.specifier === specifier);

    const subpathOnly = (source) => exportsOf[source].includes(symbol)
      && !exportsOf[root.source].includes(symbol);

    if (!entry) {
      problems.push(`Control ${symbol} names ${specifier}, which is not a package export.`);
    } else if (!subpathOnly(entry.source)) {
      problems.push(`Control ${symbol} must be exported only by ${specifier}.`);
    } else if (!documentedSymbols(readPage(entry.page) ?? '').includes(symbol)) {
      problems.push(`Control ${symbol} is missing from the ${specifier} API page.`);
    }
  }

  return problems;
}

function main() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  const entries = entryPoints(pkg);
  const exportsOf = exportedNames(entries.map((entry) => entry.source));

  const readPage = (page) => {
    const file = path.join(API, page);

    return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : undefined;
  };

  const problems = apiReferenceProblems({ entries, exportsOf, readPage });

  if (problems.length) {
    console.error(`✗ ${problems.length} API reference problem(s):`);
    for (const line of problems) console.error(`  ${line}`);
    process.exit(1);
  }

  console.log(`✓ API reference covers ${entries.map((entry) => entry.specifier).join(' and ')}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
