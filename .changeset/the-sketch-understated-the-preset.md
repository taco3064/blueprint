---
"@kekkai/blueprint": patch
---

**The authoring playbook's config sketch said a preset sets two gates. It sets nearly the whole
catalog.** The `rules` line in the sketch is deliberately short — declaring a gate you are not
translating is the owner's tuning, not adoption's — and the comment explaining that called the two
shown gates "the two gates a preset already sets". A field agent checked it against `blueprint
rules` on a repo scaffolded from `reactPreset()`: 17 of the catalog's 18 optional gates are set, 11
of them at error tier.

It cost that run nothing, because the preset path never reads the sketch. It was reported anyway,
which is right: the cost is a property of the run, and the next reader is someone hand-authoring a
config who takes it as the preset's whole posture. Understating this tool's strictness is the one
misreading it can least afford.

The sentence now says these are two gates a preset sets *too*, not the set a preset sets, and points
at `blueprint rules` for that set. No replacement number: a count has an address, that command is
the address, and a number in prose is the thing that goes stale.
