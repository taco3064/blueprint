---
"@kekkai/blueprint": patch
---

**Two outputs each told half a truth, and one of them could cost an adopter a rule.**
Found by the field run that followed the previous fixes — six more adoptions, all green,
none blocked.

**`inspect`'s declaratory selfOnly note says the entry collides today.** For an empty
layer the finding is right: nothing can be re-exported, so the ban cannot fire. But the
`no-restricted-syntax` ENTRY is emitted now, on the importer layers — and flat config
never merges, so a house rule of the same id scoped to one of those layers either
replaces blueprint's entry or is replaced by it, silently, with lint still green. An
agent worked that out from `rules --json` and warned that anyone trusting "cannot fire"
alone would drop their own guardrail on the way past. The note now says which of the two
statements is about the ban and which is about the entry, and points at the emit points.

**The playbook stops asserting it created a `.claude/` it may not have.** Cleanup said
to delete the directory because "init created the tree only to hold this command" — a
fact init knows and had never checked, and false for every repo whose owner already uses
Claude Code. Init now measures it before writing anything and the step states what is
actually true: `.claude/` goes only when init made it.

**The playbook names its own prior output as a previous answer, not upstream intent.**
Step 1 treats an architecture doc or a `CLAUDE.md` section as evidence senior to the
import matrix. On a repo blueprint has already adopted, those ARE blueprint's earlier
answer — an agent re-adopting one noticed it had nearly reproduced the old config
verbatim and could not tell whether the method had led it there or whether it had copied.
Agreement is the good outcome, but only when the flow was derived independently first;
otherwise a mistranslation from the first pass becomes permanent.

Also fixed, in the harness rather than the package: the field-run report summarised
doctor by its last line, so the version-control note added in the previous change
appeared where the verdict belongs. Appending after a conclusion breaks readers that
assumed the conclusion came last — that one was ours.
