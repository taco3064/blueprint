import fs from 'node:fs';

export interface ProhibitionLanguageOptions {
  parser?: {
    meta?: { name?: string };
    parseForESLint?: (source: string, options: object) => { ast: { body: unknown[] } };
  };
  parserOptions?: { ecmaFeatures?: { jsx?: boolean }; [key: string]: unknown };
  ecmaVersion?: unknown;
  sourceType?: unknown;
}

export function prohibitionParserCapabilities(
  options: ProhibitionLanguageOptions | undefined,
  file: string,
) {
  const parser = options?.parser?.meta?.name ?? '';

  const framework = file.endsWith('.vue')
    ? parser.includes('vue') && vueScriptsAvailable(options!, file)
    : !/\.[jt]sx$/.test(file) || parser.includes('typescript') || jsxEnabled(options);

  const typeReferences = !/\.tsx?$/.test(file) || parser.includes('typescript');

  return { framework, typeReferences, syntax: framework && typeReferences };
}

function jsxEnabled(options: ProhibitionLanguageOptions | undefined): boolean {
  return options?.parserOptions?.ecmaFeatures?.jsx === true;
}

function vueScriptsAvailable(options: ProhibitionLanguageOptions, file: string): boolean {
  const parse = options.parser?.parseForESLint;

  if (!parse) {
    return false;
  }

  const parserOptions = {
    ...options.parserOptions,
    ecmaVersion: options.ecmaVersion,
    sourceType: options.sourceType,
    filePath: file,
  };

  try {
    const proof = parse.call(options.parser,
      '<script>var __blueprint_probe__ = 1;</script>', parserOptions);

    if (proof.ast.body.length !== 1) {
      return false;
    }

    if (fs.existsSync(file)) {
      parse.call(options.parser, fs.readFileSync(file, 'utf-8'), parserOptions);
    }

    return true;
  } catch {
    return false;
  }
}
