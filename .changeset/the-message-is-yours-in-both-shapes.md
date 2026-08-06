---
"@kekkai/blueprint": patch
---

**The merge step told you to carry everything the emitted entry did, and forbade the only source
that had one of those parts.** An emitted `no-restricted-syntax` entry is `{ selector, message }`.
`blueprint rules` is the sanctioned source for a fold, the playbook says never to take the strings
from an emitLint dump, and the same paragraph said the combined entry must carry "everything the
emitted one did" — so an agent read the three together as two sanctioned sources disagreeing, and
went to the dump for the message text.

The stance was already right and already written: **the message is yours to write, because doctor
compares selectors and never messages.** It had just reached one output shape. The text catalog has
carried it since an earlier run raised the same doubt; `rules --json` did not, and `--json` is where
the merge step sends a folding agent. Both shapes now carry it from one string, so they cannot
drift, and the playbook names the message as the one part of the emitted entry a fold does not
reproduce.

Third time the same generator has fired: this catalog is the supported source for rebuilding an
entry, and each release found another part of the entry it did not carry — the selectors, then the
`ignores`, now the message. The message is the one that resolves by stating a stance rather than by
shipping data.
