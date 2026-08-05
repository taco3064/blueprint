---
"@kekkai/blueprint": patch
---

**`init` no longer overwrites a hand-written contract whose path does not end in
`.md`.** When a context file exists without the managed marker block, init leaves
it alone and writes the generated block to a reference file beside it — that is
the rule, and the code comment calls appending to someone's document "graffiti".

The reference name was derived with `replace(/\.md$/, '.blueprint.md')`. For any
path outside that pattern the replacement did nothing, so the reference path came
out **identical to the original**, and the write landed on the author's document
rather than next to it. The plan still announced it as a reference.

`emit.agents` accepts any path, and the ones that trigger this are ordinary
choices: `.mdc` to keep a contract in a Cursor rules folder, `.mdx` for a docs
site, or no extension at all. The default targets are all `.md`, so a repo that
never customises a path was never exposed.

The suffix now goes before whatever the extension is (`context.mdc` →
`context.blueprint.mdc`), and a dotfile keeps its name intact
(`.gitignore` → `.gitignore.blueprint`, never `.blueprint.gitignore`).

Found by re-checking a mutation-testing survivor that had been filed as
equivalent: the mutant removed the `$` anchor, and on a `.mdc` path it produced a
*more* correct result than the original — which is what made the original wrong.
