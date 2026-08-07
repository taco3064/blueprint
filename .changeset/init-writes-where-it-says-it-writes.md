---
"@kekkai/blueprint": minor
---

**Two ways `init` could write somewhere you did not point it. Both refused now.**

**A hand-written contract could be overwritten instead of getting a reference beside
it.** When a context file exists without blueprint's managed marker block, `init` leaves it
alone and writes the generated block to a reference file next to it. The reference name was
built by replacing a trailing `.md` — so for any other extension the replacement did
nothing, the reference path came out *identical to the original*, and the write landed on
your document while the plan announced it as a reference.

Who was exposed: anyone setting an `emit.agents[].path` that is not `.md` — `.mdc` for a
Cursor rules folder, `.mdx` for a docs site, or no extension at all. The default targets
are all `.md`, so a repo that never customised a path was never affected. The suffix now
goes before whatever the extension is (`context.mdc` → `context.blueprint.mdc`), and a
dotfile keeps its name (`.gitignore` → `.gitignore.blueprint`).

**A config path could reach outside the repo.** `emit.handbook` and `emit.agents[].path`
are strings from your config that reached the filesystem unchecked, so
`emit.handbook: '../HANDBOOK.md'` wrote one directory up — with `✓ write:` printed beside
the escaping path. The realistic input is not an attack but a relative path off by one
directory in a monorepo, written by the agent blueprint asks to author the config. The run
is now refused before a single write, so `--dry-run` cannot print a plan the real run would
reject, and the refusal names the path, that nothing was written, and the two config fields
that set one.
