---
"@kekkai/blueprint": patch
---

**A layer-level note on a modular project no longer addresses a folder you must not
create.** `owns-not-installed` and `declaratory-self-only` both reported at
`src/<layer>`, which is the layer's own folder on a flat project and a top-level
folder holding source under `architecture.modules` — an **undeclared module**, so the
one action the address suggested traded an `info` for an `error` that governs nothing.

```
# before, on a modular project
· [owns-not-installed] src/hooks
    Layer "hooks" owns "rbush", …

# after
· [owns-not-installed] src
    Layer "hooks" owns "rbush", … This project declares `modules`, so "hooks" is a
    layer inside each one rather than a folder of its own — it has no single path, and
    the note is addressed at the source root instead. Do not create `src/hooks` to
    satisfy it: a top-level folder holding source is an undeclared module, which
    `inspect` reports as an error and which governs nothing.
```

- **The source root is the address, and the message carries the rest.** A layer under
  modules lives at `src/<Module>/<layer>` in every module, so it has no single path to
  claim. The root is the one address `undeclared-module` cannot reach — it walks the
  directories *inside* the source root — and the sentence names the folder not to
  create, because that is the move the old address invited.
- **A module's `owns` says "Module".** It read `Layer "Combat" owns …`, against the
  vocabulary this release settled: a **module** is the feature, a **unit** is the thing
  inside a layer. The word is read from which list the entry was declared in.
- **Flat projects are unchanged**, in both the path and the message.
- Still `info` at both levels, so neither sets the exit code nor enters the baseline.
- The authoring playbook described this note as naming "the layer that declares it",
  which a module-level `owns` contradicts; it now names either level.
