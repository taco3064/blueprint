---
"@kekkai/blueprint": minor
---

**`survey` says which shape the top level is, before the rows that depend on it.** It runs
before a config exists, so its reading of the tree is the evidence a brownfield adopter authors
from — and every row it prints means something different depending on the answer. A `hooks` row is
a layer on a flat tree and a module on a modular one.

Three conditions, all required for **modular**:

- a **shared vocabulary one level down** — the same child-folder name under two or more top
  folders, which is what a technical vocabulary that has sunk a level looks like from outside
- **the children are not units** — under flat a layer's children *are* index-bearing units; under
  modules they are layers, and the units sit one deeper
- **nothing that is not a module grows its own tree at that level** — a veto rather than a tally,
  so one layer-shaped folder beside the modules makes the tree mixed rather than modular with an
  exception

Anything less is **could not tell**, which is a real answer and the one `survey`'s never-judges
stance prefers over a guess. A router-shaped folder abstains rather than vetoing: its children are
its router's vocabulary, so it contributes to neither of the first two conditions and does not
trip the third.

**The evidence travels with the verdict.** The reason names the condition that decided it and the
folder it decided on, and `--json` carries `sharedVocabulary` and `layerShaped` — a reader who
disagrees has to be able to check the call, or the shape line is an oracle.

The folder table, the import matrix and the package-usage section each say which level they are
describing, because the ownership question in particular changes with the shape: a concentrated
package is a candidate for a module's `owns` under one reading and a layer's under the other.

A flat tree's output is otherwise unchanged — the shape block is added and nothing else moves,
in the text report and in `--json` alike.
