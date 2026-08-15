---
'@kekkai/blueprint': patch
---

**`Finding.path`'s doc comment was wrong about `cycle`, and `cycle` is the finding whose address a reader is most likely to act on.** The type is exported from the package entry and says *"File or directory the finding is about, relative to the project root"*. A cycle's address is relative to the **source root**, and it is a module graph node key rather than a file: under the default `folder` layout, a component dropped straight into a layer keys to `components/Card` while the file on disk is `Card.jsx`.

The address itself does not move — that was measured and decided. Prefixing it is correct for four of the five node shapes and wrong for the fifth, which is the preset's own default: all six preset layers are `layout: 'folder'`, and a Vue or React starter ships `HelloWorld.vue` / `App.tsx` inside `components/`. `src/components/Card` looks like a legitimate path and resolves to nothing, where `components/Card` is visibly not one. The current spelling is also *useful*: the cycle header is the one finding address that is a command argument rather than a file to open, and it pastes straight into `blueprint deps`.

**So one report shows one folder under two addresses**, measured on a throwaway React tree:

```
✗ [cycle]    components/A
⚠ [no-entry] src/components/A
```

Three sentences now say why. The type doc carries the carve-out by name; `reference.md` and its zh-TW twin say what the address is and which command takes it; and the `cycle` migration step — printed once per rule, whatever the number of cycles — carries both the vocabulary and the next step: `blueprint deps <key>` gives the fan-in at either end before you choose which edge to invert.

**The migration line states the relation, never the literal `src/` contrast.** Under `sourceRoot: 'app'` the second address is `app/components/A`, and under `sourceRoot: '.'` the two addresses are identical — one worded example would be false for some adopters and vacuous for others, and could not tell which. Both were rendered through `dist/bin.js` rather than reasoned about, and the printed address resolved in `blueprint deps` at both roots.

**The doc is now true for every finding that carries a path, checked rather than asserted.** Every other address reaches the report through `sourcePrefix`, `layerAddress`, or the scanner's own `file.path`. Two cases that look like exceptions and are not: `missing-layer` names a directory that does not exist yet — the doc claims a spelling, not existence — and on `sourceRoot: '.'` a cycle key is project-root relative by coincidence, which is why the doc says "relative to the source root" rather than "never prefixed". That precision is what makes the sentence assertable, and it is asserted: one case reads a cycle's `components/A` and `no-entry`'s `src/components/A` off the same analysis.

**Nothing about a finding changes.** `path` itself, `subject`, every severity, the exit code, the baseline ledger, `inspect --json` and `doctor` are untouched — no baseline entry moves, and no upgrade turns a suppressed finding fresh.
