---
'@kekkai/blueprint': patch
---

**A directory *above* your project named like one of your layers could take the
layer's place, and the relative-import rule then went quiet on imports `inspect`
still reported.** Clone the same repo to `~/components/my-app` instead of
`~/my-app`, with `components` among your layers, and lint stops flagging what it
flagged the day before — same code, same config, different verdict, and nothing
in either output that would let you tell which run was the honest one.

Measured, on one project rendered at two paths: at `…/my-app`, one
`blueprint/relative-escape` error; at `…/components/my-app`, exit 0. Meanwhile
`blueprint inspect` reported `layer-escape` on that file in both, printing
`(lint: blueprint/relative-escape)` beside a rule that had just said nothing.
**Two of this tool's own gates, opposite answers, one file** — and the two are
supposed to be incapable of that, because they call one shared judgment. What
had drifted was not the judgment; it was the coordinates handed to it.

The cause is that a lint rule is given an absolute path and has to find your
project inside it. Under `sourceRoot: '.'` there is no root directory to search
for, so a declared layer name is the *entire* anchor and the outermost match
wins — including one that belongs to somebody's home directory. `nextPreset`
without `srcDir` emits `sourceRoot: '.'`, so this was the default path for Next
adopters, and `components`, `hooks`, `lib`, `app` and `services` are ordinary
directory names to have a checkout under.

**The fix hands the rule the project root, the way `depth` and `sourceRoot` are
already handed to it.** The generated `eslint.config.mjs` computes it from the
one thing that is guaranteed to sit at your project root — the config file
itself:

```js
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default [
  ...emitLint(blueprint, { stylistic, imports, projectRoot }),
];
```

`cwd` was tried first and rejected on measurement: running `eslint .` from
inside a layer directory puts `cwd` *at* the layer, so anchoring there breaks a
case that works today. The config file's location does not move when the linter
is invoked from somewhere else.

**Two things to know if you merged `emitLint` into your own config by hand.**
`projectRoot` is a value your config computes, not a package it imports — so
copy the two `node:` lines and the `const` across along with the spread. And if
you do not, **`blueprint doctor` now fails its merge-survival check** and names
the missing argument, rather than leaving you with the silence this release is
fixing. Nothing else changes: a project at an ordinary path reaches exactly the
verdicts it reached before, at every `sourceRoot`.

This also closes the same hole one shape further out on a *named* root, where it
needed an ancestor spelling `<sourceRoot>/<layer>` in that order —
`/work/src/components/my-app/src/components/Card.ts` was read as anchoring at the
outer `src/components`. Rarer, never reported, fixed by the same anchor.
