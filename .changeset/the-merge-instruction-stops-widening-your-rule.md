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

What the outputs say now, verified with `eslint --print-config` per direction rather than
reasoned:

- **The mechanism carries its qualifier.** The later entry replaces the earlier *on the
  files both of them match* — so only the overlap has to be combined. That sentence was the
  generator: three separate scope claims downstream of it were wrong.
- **A scope mismatch is resolved by the collision, and neither side moves.** Scope the
  combined entry to where the two globs meet and leave your original entry where it was.
  Three entries then cover three sets, and no file gets a rule it never had.
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
