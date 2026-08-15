---
'@kekkai/blueprint': patch
---

**`blueprint/no-typedef-only-file` was emitted on a hard-coded `src`, so it never ran on
a project rooted anywhere else.** Every neighbouring entry in the generated config builds
its `files` from the root your config names; this one carried the literal `src/**/*.js`.
Move `architecture.sourceRoot` to `app` and ten entries follow it while this one stays
behind, matching no file — and matching no file is silent. It did not error and it did
not warn: the config was valid, `inspect` was clean, and the gate was simply absent.

`typedefOnlyFile: 'warn'` is a preset default, so the rule is on for every `vuePreset`
and `reactPreset` project without anyone opting in. Two shapes could reach the defect,
and neither is a preset option — `vuePreset` and `reactPreset` take no `sourceRoot`:

- a preset spread and overridden — `{ ...vuePreset(), architecture: { ...., sourceRoot } }`
- a hand-written `defineBlueprint` carrying `typedefOnlyFile` and a root that is not `src`

**The fix composes the glob from `sourceRoot`**, through the same helper the layer globs
have always used. A project rooted at `src` emits `src/**/*.js` exactly as before, and a
project rooted at `lib/app` now emits `lib/app/**/*.js`.

Under `sourceRoot: '.'` the entry is `**/*.js`, with no prefix — not `./**/*.js`, which
matches none of the paths ESLint hands a rule. The wide net is deliberate and is the same
rule it always was: this entry has always meant *every `.js` file under the source root*
rather than *every `.js` file in a declared layer*, and a `src`-rooted project's
`src/**/*.js` already covered files no layer governs. Under `.` the source root is the
project, so the same sentence describes a bigger net.

`nextPreset` was never affected: it calls `defineBlueprint` directly, carries no `rules`
block, and never emits this entry at all — including on its own `sourceRoot: '.'` default
under `srcDir: false`.
