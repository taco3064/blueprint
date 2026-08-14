---
"@kekkai/blueprint": patch
---

**A `selfOnly` ban is armed only by files a layer glob reaches.** `declaratory-self-only`
decided whether the ban had armed by asking whether any file sat at layer depth, and under
`architecture.modules` that admits files no glob governs: the contents of a `layers: false`
module, and of an undeclared top folder. Both made the layer look inhabited, so the note
was suppressed while the ban was still blank — the exact state it exists to report.

```
# before, on a modular project whose only `contexts/` sits in a `layers: false` module:
# no note of any kind

# after
· [declaratory-self-only] src
    selfOnly on "contexts" (importer(s): hooks) is declaratory — the layer holds no files,
    so the re-export ban cannot fire yet; it arms once code lands. […] IF a second
    no-restricted-syntax scoped to one of those layers exists, flat config merges neither
    into the other — the later entry replaces the earlier, silently, with lint still green.
```

- **Suppression was the wrong direction to fail in.** This note is the only place that
  merge condition is stated, and its audience is someone folding these rules into a config
  they already have. Missing, they merge without being told what to check — and the failure
  it describes is silent, with lint green either way. A noisy note costs a paragraph.
- **One measurement, both layer-level notes.** `missing-layer` already answers "does any
  declared, layer-bearing module hold a file under this layer", so this note reads that
  same list rather than carrying a second, looser one. It is the set the emitted globs are
  expanded over, so the answer cannot drift from what the config governs — nor from what
  the note next to it says.
- **The message needs no new clause.** "The layer holds no files" beside a visible
  `src/app/contexts/` would be two truths with nothing joining them, and the join is
  already in the same output: this note fires only on the emptiness `missing-layer` fires
  on, so that note — with its `layers: false` clause and the path — is always beside it,
  and `undeclared-module` errors in the other case.
- **The scan-size guard stays.** On a scaffold every layer is blank and the coverage line
  already says so. It now carries more weight than it did: an empty tree and a tree whose
  only files sit outside the layer vocabulary measure the same, and the guard is what tells
  them apart.
- **Flat projects are unchanged**, byte for byte, verified through `dist/bin.js` on the
  same fixture before and after.
- **A brownfield repo with a baseline can see one more note here** on code that did not
  change. It cannot turn a gate red: the finding is `info`, `inspect --baseline` fails on
  fresh **errors** only, and `--update-baseline` never records an `info` as debt.
