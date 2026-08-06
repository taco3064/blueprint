---
"@kekkai/blueprint": patch
---

**One `inspect` run inventories every import cycle.** The walk returned on the first
cycle it met and the report carried that one, so a repo with three unrelated cycles
was told it had one — the second appearing only after the first was fixed and inspect
re-run.

Enforcement was never affected: one cycle fails the gate, and that is all a gate
needs. The report is also the brownfield debt inventory, and "how many" is a different
question from "whether any" for anyone sizing the migration — one the tool can compute
rather than hedge with "there may be others".

One cycle per **strongly connected component**, not every elementary cycle: a graph's
cycles can outnumber its nodes exponentially, and that list is not an inventory
either. An SCC is a knot of mutual dependency broken as a unit, so `a → b → c → a`
plus `c → b` reports as one. The inventory is ordered by content rather than by
traversal, so adding an unrelated module does not reshuffle the report.
