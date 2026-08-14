---
"@kekkai/blueprint": patch
---

**A dropped gate carrier names the entry that lost it, and says so once.** Doctor's survival check
reported a carrier loss with the probe's *layer* — and a module zone has no layer, so a module root
or a `layers: false` module losing a carrier printed `undefined: rules.maxLines is on but …`.
Interpolating an optional string is legal, so nothing typed or ran caught it.

**The check stays per probe; the report no longer is.** A merge can drop a carrier from one entry
and leave the rest intact, and a global lookup misses exactly that — but at 41 modules × 5 layers
that check printed the same sentence up to 241 times, and volume hides the one thing the reader
needs from it. Whether this is one problem or many is a number the check is already holding, so it
reports the measurement instead:

- lost on **every** entry — one line with the count, and the repair is that `emitLint`'s carrier
  argument never reached the spread
- lost on **some** — one line naming which, and the repair is that a later entry replaced the rule
  there while the argument reaches the rest

Two different repairs, which is why the distinction leads the sentence rather than trailing it.
