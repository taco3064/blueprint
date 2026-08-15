---
'@kekkai/blueprint': patch
---

**`blueprint deps` refused the address its own report had just printed, on any repo
whose source root is not `src`.**

`deps` scans the tree under `architecture.sourceRoot` and then normalised the target
you typed by stripping a literal `src` segment — one function, four lines apart,
reading the source root two ways. Every finding but `cycle` prints its address from
the project root, so on a config naming any other root the two disagreed in both
directions, measured on a `sourceRoot: 'app'` tree:

```
# 3.1.0
$ blueprint inspect
  ⚠ [no-entry] app/hooks/useCart        ← the address the report gives you
$ blueprint deps app/hooks/useCart
  ✗ Unknown module "app" — run `blueprint deps` to list every module.   (exit 1)

$ blueprint deps src/hooks/useCart      ← a path this repo does not have
  hooks/useCart                                                          (exit 0)
    imported by (1):
      ← components/Card
```

The second half is the one to check for in your own scripts: a `src/`-prefixed target
was stripped as though `src` were the root on **every** root, so it answered — with
someone else's node — instead of saying it did not know.

`deps` now strips the source root the config names, and only when the target carries
that root whole. `sourceRoot: 'lib/app'` takes both segments; `sourceRoot: '.'` takes
none; a target sharing one segment with a nested root (`lib/hooks/useCart`) is not
treated as prefixed. Unchanged: every target form on the default `src` root, and the
bare module key the leaderboard prints (`hooks/useCart`), which never carried a prefix
to strip.

That covers every address the report prints, not only the ones under a declared layer:
`undeclared-folder` addresses `app/legacy`, and pasting it back now answers `"legacy/"
is not a declared layer, so nothing governs it` — the sentence that names the cause —
where it used to answer `Unknown module "app"`.

Where a source root's name is also a module's, the root wins: with `sourceRoot: 'app'`,
`app/hooks/useX` addresses the `hooks/useX` unit, and a module named `app` is reached
as `app/app/hooks/useX`.

The `deps` guide said all input forms resolve "with or without the `src/` prefix",
which this makes false; both language editions now name the configured root instead.
