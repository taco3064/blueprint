---
'@kekkai/blueprint': major
---

**Four things break for a project that adopts nothing new in this release**, and
one of them needs nothing of yours at all. Each is listed with who it reaches, so
you can tell in one screen which are yours; the edits are in the migration guide.

- **`blueprint init` refuses on a fresh tree without `--structure`.** *Reaches:
  anyone who runs `init` on a tree below the brownfield threshold.* No config, no
  script and no baseline of yours is involved — a scripted `init` against a
  template repo starts exiting 1 having changed nothing. It refuses rather than
  defaulting because the config migration is free and the file migration is not:
  switching later moves every file under `src/`.
- **`architecture.module` is deleted.** *Reaches: every `3.x` config, a flat
  project adopting nothing here included.* The unit shape did not disappear, it
  moved onto the layer that has it — `layout` and `entry` sit on `layers[]` now.
  The config throws at load until you make the edit, and the message carries the
  replacement. `module.private` goes with no replacement, and that is a trade
  rather than a free win: **enforcement does not weaken** — the entry-only ban
  already covered every non-entry file rather than three named parts — but you
  lose the ability to *describe* which private parts a unit is expected to have.
- **The layout value `'flat'` is now `'file'`.** *Reaches: you, while you are
  making the edit above.* This is not a second field to search your config for —
  `layers[].layout` did not exist in `3.x`. The **value** is what carries over,
  out of whichever `module` block you had: the shared
  `architecture.module.layout`, or a layer's own
  `architecture.layers[].module.layout`. Both took `'folder' | 'flat'`, and both
  land you on a rejected `'flat'` if you transcribe it. `'flat'` was needed for
  the root axis, and one config file cannot spell two axes with the same word.
- **A version-2 `.blueprint-baseline.json` is refused.** *Reaches: every project
  holding a baseline, flat or modular.* One command
  (`inspect --update-baseline`), the same debt recorded, nothing that was
  suppressed stops being suppressed. It is refused rather than reinterpreted
  because `relative-escape` split into three finding ids — `src-escape`,
  `entry-bypass` and `layer-escape`, each carrying the remedy that is legal for
  it, where one sentence used to answer all three and was true of one. A finding
  id is part of an entry's key, so the old file matches nothing.

**Two more breaks exist and neither is above**, because neither reaches a project
that does not declare `architecture.modules`: `blueprint rules --json` and
`blueprint deps --json` change shape. They are under Minor Changes, which is
where a flat project is right to leave them.

**The edits, ordered by who is hit:**
[Upgrading to 4.0.0](https://taco3064.github.io/blueprint/guide/upgrading).
