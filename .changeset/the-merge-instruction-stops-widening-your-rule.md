---
"@kekkai/blueprint": patch
---

**The lint-merge instruction stopped telling you to widen your own rule.** This is the one
entry in the release where an output did not merely overstate something — it prescribed the
wrong edit, and a field agent made it.

Folding blueprint's emitted `no-restricted-syntax` entry into a house config that already
sets that key means writing one combined entry. When the two sides' file scopes were never
the same — a house rule framed at `**/*.vue` against a layer glob of `.{js,vue}`, the
ordinary case — the playbook said to widen yours to blueprint's glob, and justified it with
an asymmetry: your rule reaching new files is visible red, blueprint's ban losing files is
silent, so blueprint's scope wins.

**The justification is false, and flat config is why.** A config entry does nothing at all
to a file outside its own `files`, so `...emitLint(blueprint)` goes on enforcing blueprint's
entry everywhere your entry does not reach. Narrowing yours cannot make blueprint's ban lose
a file — there is no silent side to weigh against the loud one. Following the instruction,
an agent widened a date-guard onto a layer's `.js` files and took 38 errors in one test file
that deliberately relaxes that rule; the correct edit was the narrowing the paragraph warned
against.

What the outputs say now, verified with `eslint --print-config` per direction — on both
ESLint majors CI runs, every cell identical under 9.39.5 and 10.8.0 — rather than reasoned:

- **The mechanism carries its qualifier.** The later entry replaces the earlier *on the
  files both of them match* — so only the overlap has to be combined. That sentence was the
  generator: three separate scope claims downstream of it were wrong.
- **A scope mismatch is resolved by the collision, and neither side moves.** Scope the
  combined entry to where the two globs meet and leave your original entry in place.
  Three entries then cover three sets, and no file gets a rule it never had.
- **That arrangement is order-dependent, and the constraint sits on the entry you write.**
  The combined one goes last in the array — that is after the spread and after your own
  entry both, and above your own entry instead, later-replaces-earlier puts your bare rule
  back on top in the overlap with blueprint's selectors gone there. Stated the other way
  round ("move your entry up") it would have been a silent replacement of its own: an entry
  lifted over the spread hands blueprint every OTHER rule key it sets, measured on a house
  entry that also set `no-restricted-imports`. Nothing you already had has to move.
- **The verification probe grew the case the new shape needs.** Two `--print-config` probes
  in the affected layer, one inside the collision and one outside, because the recommended
  arrangement deliberately makes files in a single layer resolve different entries — and
  `doctor` resolves one path per layer, which its ✓ already said it does.
- **The two silent losses are named, and both are about what the entry contains** — leaving
  blueprint's selectors out of an entry that matches its files (doctor's survival check
  reddens), or folding your own original entry away so your rule stops governing the rest of
  what it used to (doctor does not compare the rules you brought, and the print-config pass
  now probes for it).
- **The `ignores` trade is no longer a trade.** "One entry carries one `ignores`, so a merge
  has to pick" rested on the same premise one paragraph down. Leave the original entry in
  place and the collision's test files keep the house rule after blueprint's exemption lifts
  the combined entry off them, so there is nothing to give up.
- **The reference page's folding section says the same thing**, in both languages — it
  carried the unqualified mechanism too, and a fix to one copy would have made them
  disagree.
