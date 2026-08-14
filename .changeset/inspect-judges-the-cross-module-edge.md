---
"@kekkai/blueprint": minor
---

**`inspect` now has a verdict on a cross-module edge.** Under `architecture.modules`,
`analyze` judged every alias import by the layer at `segments[depth]` and never read the
module at `[0]` — so three of the four shapes an edge can take were red in lint and silent
in `inspect`, and the fourth was red under the wrong finding with a remedy a different
finding forbids. A repo whose modules imported each other freely could pass
`blueprint inspect --baseline` and `doctor` with only the eslint run catching it.

Four shapes, three separate causes, all of them closed:

- **An undeclared edge** — `~app/common` from a module that declares only `Combat` — read
  `parts[1]`, got `undefined`, failed the declared-layer test and fell out of the loop. The
  silence was a skip, not a verdict. It is now `undeclared-dependency`, whose remedy names
  `imports` in the config.
- **A reach past a declared dependency's entry** — `~app/Combat/hooks/useDamage` — reported
  as a *same-layer* import, because `Fighter/hooks` and `Combat/hooks` are different folders
  whose layer names compare equal by name alone. It is now `deep-import`, and the message
  names the module's entry as a string to type rather than a shape to derive.
- **Both of the above from the module root** — `Fighter/Fighter.tsx` puts a filename where a
  layer name is read, so no layer-keyed test could match. The cross-module verdict reads no
  layer at all, so the root and a layer file answer identically.

The old same-layer sentence told the reader to *"use a relative path"*, which
`module-escape` answers with *"a relative path cannot express it"* — one gate instructing
an adopter to write what the other rejects. No `inspect` message says that across a module
boundary now.

Deciding the module before the layer also closes two edges nobody had filed: the
forbidden-layer and `selfOnly` re-export arms read the same layer slot, and the emitted
bans for both are module-scoped, so `inspect` was red where lint was green. Both now agree.

`undeclared-dependency` is a new finding id, in the migration table and the enforced-by
table beside the rest. Flat projects are unchanged — the whole arm is behind the module
depth, and a flat project has no module segment to compare.
