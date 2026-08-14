---
"@kekkai/blueprint": minor
---

**`inspect` speaks module vocabulary about the top level.** Under
`architecture.modules` the folders at the source root are modules, and the two directory checks
read them against the declared module list rather than the layer list — which reported every
module as an undeclared *layer*, loudly and about the wrong kind of thing.

**`undeclared-module`** — a root folder not in `architecture.modules`. `error`, and the message
says why this is worse than a missed report: the layer globs are expanded **from** the declared
list, so no glob matches inside an undeclared folder and every structural ban there is inert. It
is ungoverned rather than unflagged, and lint stays green throughout. Its migration line is
`inspect only — never appears in a lint run`, which is the finding's whole point: an agent whose
loop ends at a green lint never learns of it.

**`missing-module`** — declared, no folder on disk. `info`, worded as runway the way
`missing-layer` already is, and it never enters the baseline as debt.

**The finding hands over a draft, not a demand.** Declaring a module is a name *and* a place in
the order, and the import graph knows both halves — a module may only name modules declared after
it, so each measured edge bounds the position from one side. Three outcomes, and the tool takes
the same stance `projectCovers` and `syntheticPath` do, where an unusual shape yields no verdict
rather than a wrong one:

- **A legal interval** — usually a range: *any position after `GameStage` and before `Session`*.
  Which one, and what it may import, stays the owner's call.
- **No evidence** — it imports nothing and nothing imports it. Say exactly that and stop.
- **No legal position** — the measured edges contradict. That is itself the finding: the
  decomposition needs changing, not the config.

The inference reads a folder-level import graph built for it, over alias and relative specifiers
alike. The existing module graph could not answer: it admits only files under declared names, and
an undeclared module is undeclared by definition — so every real case would have come back "no
evidence", and the interval outcome the hint exists for would have been unreachable.

Flat projects are untouched: `undeclared-folder` and `missing-layer` are unchanged in wording,
severity and behaviour.
