---
"@kekkai/blueprint": patch
---

**The agent contract now says test support is exempt from placement.** Its "Where code
goes" section gains one line naming your own `architecture.testFiles` globs, so an agent
blocked on files that exist only to serve tests knows there is a third door to ask about.

- Rendered from the blueprint, never a hard-coded pair. `testFiles: []` renders nothing.
- It is a reporting instruction, not a remedy: widening the globs stays the owner's edit,
  and renaming a file to match them is called out as never being the fix. The remedies an
  agent may take itself are unchanged.

Only the full contract (`.cursor`, `.windsurf`) changes. The compact block CLAUDE.md and
AGENTS.md receive is untouched.
