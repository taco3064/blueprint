---
'@kekkai/blueprint': major
---

**What `4.0.0` moved, and what it did not.**

Until now blueprint governed one axis: technical layers at the root of your
source tree, flowing one way. It now governs two — **feature modules at the root,
with those same layers inside each one.** Everything below is that capability,
the edits it costs, or a fix that stands on its own.

**The second axis is additive, and the measurement that matters is which rules
are in force.** Omit `architecture.modules` and your project is governed by
exactly what governed it in `3.1.0`. Taking the React preset's flat config
through the one edit that is mandatory, then comparing the emitted ESLint config
against `v3.1.0`: **fourteen rules are enabled on both, id by id, over the same
file globs, at the same severities, with the same banned patterns.** Three things
differ and none of them changes a verdict:

- five ban messages say *unit* where they said *module*
- `blueprint/relative-escape` carries one new option — `depth`, holding `0`, the
  number that means "this project has no modules"
- the embedded plugin ships two more rule *definitions*,
  `blueprint/no-module-reexport` and `blueprint/no-module-root-import`. **Neither
  is enabled anywhere without `modules`** — they travel with the plugin, they do
  not run on your code

That third one is why a byte count is the wrong instrument here, and worth saying
before you reach for one: depending on which artifact you weigh — the
`eslint.config.mjs` on disk, which only *calls* `emitLint`, or the resolved
config ESLint actually runs — this release measures as no change at all or as
roughly ten thousand bytes of it. The rules in force are the same fourteen in
every case. **The public API is likewise the same list of exports**, with nothing
added, removed or renamed.

**Where a flat project does see a difference it is the emitted prose, and one of
those differences is a correction worth reading before you upgrade.** The emitted
handbook, the emitted agent contract and the authoring playbook all said in `3.x`
that a same-layer import is banned outright. It never was, and they prescribed
sinking shared code into a lower layer instead — so if you took that advice, the
imports you were avoiding were legal. It leads the Patch Changes below, with the
rest of what a flat project actually hits.

**What everyone edits, once:** `architecture.module` is deleted, and the unit
shape moves onto the layer that has it. Your config will not load until you make
that edit, a flat project adopting nothing here included. Four breaks reach a
project that changes nothing else and two more wait for anyone declaring
`modules`; all six are ordered by who is hit, with the edits and a line saying
where a flat project stops reading, at
[Upgrading to 4.0.0](https://taco3064.github.io/blueprint/guide/upgrading).

**The honest bound.** The flat half of this release has field evidence behind it —
real agent CLIs taking real repos through `init` → `inspect` → `impact` →
`doctor`. The modular half has never been in an adopter's hands, so every claim
about it is measured against fixtures, rendered documents and real `dist/bin.js`
runs instead. Some of what shaped this release is deliberately not an entry
below — the migration guide and the reference sweep are documentation, and a
decision that changed no behaviour, such as `cycle`'s address staying a module
graph node key, leaves nothing to describe. The per-item record is this repo's
issues and commits.
