---
"@kekkai/blueprint": patch
---

**Two runs recovered from an interrupted install by reading blueprint's own `package.json`.** The line
before the install named the packages and pointed at `--no-install` "which prints the command to run
yourself" — a round trip through the step that just hung. Both agents killed the install, and then went
into `node_modules/@kekkai/blueprint/package.json` for version ranges to hand-write into their project's
own, which is reverse-engineering internals for a list that does not exist: those packages install
unpinned on purpose, so `eslint` resolves to the newest supported major.

The command is now on screen before the wait, on its own line, so killing the install leaves it there.
And the sentence says outright that there is no version list to look up first — the move both agents
made, pre-empted where they made it.
