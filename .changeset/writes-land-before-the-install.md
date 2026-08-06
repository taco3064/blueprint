---
"@kekkai/blueprint": minor
---

**An interrupted install used to leave the import alias unwired.** `init` plans a dependency install
in the middle of its work, and the alias edits to `tsconfig` / `vite.config` sat below it. A field
agent on a machine that could not reach the registry waited, killed the install, and was left with a
config, an agent contract and an eslint config — and no alias anywhere in the toolchain. `doctor`
then reported `~app resolves nowhere`, which reads as a defect in the tool rather than as an install
that never finished, and two toolchain files had to be hand-edited to clear the final gate.

An earlier fix stopped the *output* claiming those edits when the install threw. That was the
narration; this is the state. Every filesystem effect now lands above the install, which is the rule
already stated for blueprint's other child process — "every artifact lands on disk before the spawn,
so a failed launch degrades to exactly the manual path". An interrupted install now leaves a tree
that is complete except for `node_modules`, which one command finishes, and the assertion guarding it
is the boundary rather than the alias's position: any effect added below the install would strand the
same way, whatever it writes.

**And the install now announces itself before it runs, not after.** Every other action here is a
local file operation that returns in microseconds, so `init` narrates effects once they have landed —
deliberately, since a list announced up front is a promise. The install is the exception: it spawns a
package manager that can sit for minutes, and a package manager with no route to the registry retries
in silence. Two runs read that silence as a hung tool and killed it. The line before it now says it is
the one step that needs the registry, that quiet is normal, and that minutes of quiet means
`--no-install` is the way through.
