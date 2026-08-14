---
"@kekkai/blueprint": minor
---

**A declared layer that no module uses is reported.** Under `architecture.modules` the
top level holds modules, so the directory checks read the declared **module** list and
`architecture.layers` was checked against nothing — a layer present in zero modules
produced no finding at all, while its globs were still expanded across every module and
its entries still cost something. Flat projects have always had this note; the layer axis
is what went unreported when the top level became modules.

```
# before, on a modular project: no finding of any kind

# after
· [missing-layer] src
    Declared layer "hooks" holds no code in any module yet — runway, not a todo: the
    rules arm when code lands; keeping it is the default, slimming is the owner's call.
    This project declares `modules`, so "hooks" is a layer inside each one rather than a
    folder of its own — it has no single path, and the note is addressed at the source
    root instead. Do not create `src/hooks` to satisfy it: a top-level folder holding
    source is an undeclared module, which `inspect` reports as an error and which
    governs nothing.
```

- **Absent from every module is the definition.** A layer's globs are expanded from the
  declared module list, so "is this layer governing any code" is only answerable as "does
  any declared, layer-bearing module hold a file under it". Absent from *some* modules
  reports nothing — a module with no `contexts/` is ordinary, and one note per (module,
  layer) is the volume the layer-level address decision already refused.
- **Modules are measured by their files, not their folders.** `scan.topDirs` lists the
  first level under the source root only, so a layer folder sits inside a module and
  never appears in it. That is a real difference from the flat check, which can read a
  layer's own top-level folder.
- **A `layers: false` module never counts, in either direction.** It opts out of the
  layer vocabulary, so no layer glob is emitted inside it and what its folders are named
  decides nothing. When one of them does hold a same-named folder, the note names that
  path and says why it does not count — "holds no code in any module" beside a visible
  `src/app/hooks/` is two truths with nothing joining them, which reads as the tool being
  wrong. The clause explains and prescribes nothing: opting a module out is a design
  decision about a module whose internals are its router's business, not a defect to undo.
- **An undeclared top folder is not use either.** Nothing inside it is reached by any
  glob, and `undeclared-module` is erroring about it in the same output.
- **It fires on an empty tree**, exactly as `missing-layer` always has on a flat project.
  This note reading like a todo was answered once already — by its second clause, *runway,
  not a todo*, after six of them sent a field agent toward deleting the declared layers.
  Suppressing the note on a scaffold would override that with the thing the wording fixed.
- **`subject` carries the layer name** on this note and on `declaratory-self-only`. Every
  layer-level note under modules is addressed at the source root, so `rule` + `path` no
  longer identify one — and two `selfOnly` layers were emitting one identity twice.
- **Flat projects are unchanged** in every field, path, subject and wording included.
- Still `info` at `missing-layer`'s tier, so it neither sets the exit code nor enters the
  baseline as debt.
