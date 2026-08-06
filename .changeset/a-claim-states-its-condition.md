---
"@kekkai/blueprint": patch
---

**The `declaratory-self-only` note no longer asserts a collision that needs a merge to
exist.** It said the emitted `no-restricted-syntax` entry "collides today" — true only
where a SECOND entry of that id exists, which is a merge, and inspect cannot see whether
one is coming. An adopter on the single-generated-config path read the strong claim and
spent the item deciding it did not apply. The note now carries the condition instead of the
consequence, and says outright that with one generated config there is nothing to act on.

**The playbook writes the syntax for the gate value it asks you to carry.** Its stance on
optional gates is "declare one only to translate an existing house threshold (carry its
value)" — and no channel, not the playbook, the `rules` catalog, or any error text, showed
what carrying a value looks like. Faced with `maxLines: { value: 1200 }` against
`['error', 1200]`, an adopter routed around the instruction and left the threshold with the
house lint. The object form is now written down (`{ tier: 'error', value: 1200 }`, `tier`
required), as a comment beside the schema sketch's `rules:` line rather than inside it —
that line gets copied verbatim, and a gate nobody is translating is the owner's tuning.

**The merge recipe breaks the scope tie it used to leave open.** "Carry the SAME file
scope" cannot hold for both sides when they never shared one — a house rule framed at
`**/*.vue` folded into a layer glob of `.{js,vue}`. The two failure directions are not
symmetric, so the playbook now names the winner: widen yours to blueprint's glob, because
your rule reaching files it did not govern is visible red, while blueprint's ban losing
files is silent with lint still green. The report says which extensions were newly covered
and whether anything matches them yet — often the widening is an empty set today and a bet
on what lands later, which is worth recording as a bet.

**A drawn diagram counts as part of what an intent document says.** The stale-vs-runway
tiebreak asked whether the prose mentions a layer; an adopter read the per-layer sections,
found nothing, and dropped a clause the same file's flow graph was still drawing. The
tiebreak now says to read both before calling a clause unmentioned. And once a clause is
downgraded, the drawing disagrees with the config: the playbook says to leave it
disagreeing and name the edge in the report — a hand-written document belongs to the repo,
and redrawing one is a doc reconcile nobody asked adoption to do.
