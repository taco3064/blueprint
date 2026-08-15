---
"@kekkai/blueprint": patch
---

**`doctor`'s "eslint wired to emitLint" check now reads your config's code, and reads the
call as well as the package name.** A flat config counts as wired when its code calls
`emitLint(` or names `@kekkai/blueprint`. Either tell on its own is enough — and neither
counts inside a comment or a string literal.

- **The shape it used to miss:** a config reaching `emitLint` through a shared config
  package — a monorepo's `@acme/eslint-config` re-exporting it — never spells this
  package's name, so it was wired and told it was not. Both tells are read rather than one
  replacing the other, because the reverse shape exists too: a config that renames the
  import on the way in (`import { emitLint as lint }`) never spells the call.
- **The shape it used to false-pass:** the tell in a comment. A spread commented out to
  unblock CI, a `TODO: spread ...emitLint(blueprint)` note — which is the remedy this tool
  itself prints — or the package named in a header comment all read as wired before. They
  now read `✗`, and `init` writes the `eslint.config.blueprint.mjs` reference the owner
  needs to merge from, which a false "wired" silently withheld. A local
  `function emitLint()` of your own does not count either: its calls are its own.
- **Where the scanner cannot be sure, the answer is "not wired".** A literal that never
  closes, or a regex it cannot tell from a comment, ends the scan with no verdict, and no
  verdict is treated as no wiring. That direction is chosen: a false "not wired" is visible
  and recoverable, a false "wired" is neither.
- `init` follows the same verdict, and its "already wires" note names no specifier — the
  tell may have been the call, and such a config never mentions this package.
- `doctor`'s remedy line and the authoring playbook's "Semantics the linter holds you to"
  section both state the tells and that they are read as code.

`emitted rules survive the merged eslint config` remains the check that proves the rules
are alive in the config ESLint actually resolves.
