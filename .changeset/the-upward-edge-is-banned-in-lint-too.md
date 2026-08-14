---
"@kekkai/blueprint": minor
---

**A layer reaching up to its own module root is now red in lint, not only in `inspect`.** The root
composes the layers, so nothing inside one may import back up to it — and until now only the
relative spelling of that reach was enforced. `blueprint/relative-escape` catches `../../Fighter`
by resolving the path and returns early on any specifier that does not start with `.`, so
`~app/Fighter` was an error in the report and green in the lint run.

Both spellings of the reach are banned: the module folder, and its entry named outright.

**As exact `paths` entries rather than a pattern group, and that is the design.** A group is
gitignore-matched, so `~app/Fighter` would take `~app/Fighter/hooks/useX` with it and cut the
module off from its own layers — which the same-layer and forbidden-layer groups already govern,
with the messages that fit. `paths` entries match the specifier exactly, which is what "the root,
and nothing under it" needs.

The ban is narrower than the finding, deliberately: `inspect` reports any non-layer segment under
the own module, a root component included (`~app/Fighter/Fighter`). No `no-restricted-imports`
shape expresses that, so lint carries the two named spellings and `inspect` stays the wider gate.

Three surfaces move with it, or they would each describe a config nobody has:

- **doctor verifies it.** A hand-fold that rebuilt the pattern groups and dropped the `paths` half
  is green everywhere else, and the upward edge is lint-legal again.
- **`blueprint rules` reports it** in its own column, saying outright that it is a paths entry —
  rebuilt as a group in a merge it would ban the module's own layers.
- **`root-import`'s migration line names both rules.** One reach, two mechanisms: a reader
  searching the resolved config for `relative-escape` after an alias violation would find nothing.

A flat config's emitted lint output is byte-identical.
