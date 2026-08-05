---
"@kekkai/blueprint": patch
---

**`init` wires the import alias into a CRLF tsconfig instead of asking for it by
hand.** The comment-preserving insertion — the fallback for the commented configs
`create-vite` and `create-next-app` ship — found its insertion point by matching a
bare `\n` after `"compilerOptions": {`. A file checked out on Windows has `\r\n`
there, so the match failed, the patch reported itself unparseable, and the alias
step fell through to an instruct.

The effect was a platform split rather than a crash: on posix `init` edited the
tsconfig, and on Windows it printed "add these paths yourself" — for the same repo,
with no indication that anything had been skipped. A Windows tsconfig is CRLF by
default, so this was the ordinary path there, not an edge case.

The line ending is now read off the file and reused for the inserted line, which
also stops the edit from mixing conventions into a config that the emitted
`@stylistic/linebreak-style` gate would then report in the adopter's own lint.

Found by the `windows-latest` leg of CI, which this release also adds.
