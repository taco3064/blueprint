// The emitted config, composed with this repo's own — what `npm run
// lint:blueprint` runs. Red by construction; nothing gates on it.
//
// NOT named `eslint.config.*`, and the name is load-bearing rather than
// cosmetic: ESLint searches `eslint.config.js`, `.mjs`, `.cjs`, `.ts` in that
// order, so a file called `eslint.config.mjs` in this directory would take over
// `npm run lint` from `eslint.config.ts` — silently, and with a config that is
// red on purpose. Renaming this file for tidiness is how that happens.
//
// `emitLint(blueprint)` alone parse-errors on every `.ts`: it emits rules and
// expects the adopter to bring a parser. Spreading the existing config first is
// what brings one — `tseslint.configs.recommended` wires the TS parser for
// `**/*.ts` inside it, which is the "your config already wires parsers, skip the
// parser block" case the generated config describes. It also carries the
// `globalIgnores` list, without which `eslint .` walks into `fixtures/`.
//
// The three plugins are injected, never dependencies of the library. Drop one
// and its gates emit nothing without saying so.
import imports from 'eslint-plugin-import-x';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';
import { emitLint } from '@kekkai/blueprint';
import base from './eslint.config';
import blueprint from './blueprint.config.mjs';

export default [
  ...base,
  ...emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports }),
];
