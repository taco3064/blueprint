---
"@kekkai/blueprint": patch
---

**`doctor`'s "eslint wired to emitLint" check now detects the call, not only the package
name.** A flat config whose text contains `emitLint(` counts as wired, alongside one whose
text names `@kekkai/blueprint`. Either tell on its own is enough.

- The shape it was wrong about: a config reaching `emitLint` through a shared config
  package — a monorepo's `@acme/eslint-config` re-exporting it — never spells this
  package's name, so it was wired and told it was not. Both tells are read rather than one
  replacing the other, because the reverse shape exists too: a config that renames the
  import on the way in (`import { emitLint as lint }`) never spells the call.
- `init` follows the same verdict, so such a config now gets the "already wires" instruct
  and no `eslint.config.blueprint.mjs` reference beside it. That note no longer names a
  specifier the wired config may not contain.
- The authoring playbook's "Semantics the linter holds you to" section states both tells.

Still a text test over the whole file, comments included. `emitted rules survive the merged
eslint config` remains the check that proves the rules are alive in what ESLint resolves.
