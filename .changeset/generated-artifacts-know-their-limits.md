---
"@kekkai/blueprint": patch
---

**The contract and handbook `init` writes stop naming machines that do not hold their
rules.** Both are generated from your blueprint alone — they cannot see your repo — and
they were writing sentences that need to.

- **No runner is named.** The agent contract told the next agent to fail `npm run lint` in a
  pnpm repo. It says "the project's lint run" now. Where a runner *is* known — the authoring
  playbook, written by a command that detected your package manager — it stays named.
- **A gate your blueprint cannot emit is not listed as machine-enforced.** `deepWatch`
  declared on React, or `testFilename` declared beside `testFiles: []`, appeared among the
  rules that "fail the project's lint run" and carried `lint` in the handbook's Enforced-by
  column — for rules the emitted config does not contain. The contract drops them from that
  list; the handbook keeps the row, because the declaration is yours, and names why nothing
  holds it.
- **`cycles` is attributed to `blueprint inspect`, not to lint**, in both artifacts. They
  used to disagree about it, and the contract's version was the wrong one.
- **Each hard gate says how far it reaches** — only the files a layer glob matches, so a
  declared layer holding no code has nothing that can fail, which is runway rather than
  protection.
