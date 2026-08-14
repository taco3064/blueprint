---
"@kekkai/blueprint": minor
---

**Both structural gates read a modular tree at the right depth.** With
`architecture.modules` declared, `src/<Module>/<layer>/<unit>` puts the module where the
layer used to be, and every reader of a segment position now takes that offset — derived
once and passed, never inferred twice.

Without it, a modular repo was not merely mis-governed, it was **unwatched**:

- `blueprint/relative-escape` **registered no visitors at all.** Its guard looked for a
  declared layer where the module name sits, found none, and declined the file. Not a wrong
  verdict — no rule.
- `inspect` returned early on the same test, so `flow-violation`, `deep-import`,
  `package-ownership`, `selfonly-reexport`, `relative-escape` and `no-entry` were all
  silent, while coverage reported the same files fully inside the net. Full coverage, zero
  findings, green doctor, nothing looking at the code.
- `selfOnly` on any layer was reported as declaratory — the one case that was loud rather
  than silent, and wrong in every modular repo.

Two behaviours are new rather than restored, because the flat model never needed them:
crossing a module boundary is judged before the layer is (`Fighter/components` and
`Combat/components` are different folders that compare equal by name alone), and a unit's
identity carries its module, so two modules' same-named units stay two units.

Flat projects are untouched: the offset is 0, and every existing test passes unchanged.

Known gap, tracked in #190: the module import graph is still read at layer depth, so
`cycle` findings and `blueprint deps` stay silent on a modular repo until it lands. Opening
that guard without giving the graph's key its module segment would report cycles that do
not exist, so the two move together.
