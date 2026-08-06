---
"@kekkai/blueprint": patch
---

**`impact` refused to run over a plugin none of your gates would have used.** It loaded
`@stylistic/eslint-plugin` and `eslint-plugin-import-x` unconditionally, which was a deliberate
trade: omitting a carrier plugin makes an *active* gate report zero hits, and zero hits is
indistinguishable from a clean repo. The trade is right when the gate is on, and it was made
unconditionally.

A repo translating only structural flow declares no gates at all — `inspect` said `0/17 optional
gates active` — and `impact` still failed with `impact needs "@stylistic/eslint-plugin" from the
project's dependencies and could not load it`. The verification was lost and had to be rebuilt from
`eslint --print-config` runs by hand, per layer.

Each carrier is now required exactly where a gate rides it, read from the same gate list doctor's
survival check uses — so "needed here" means what "expected to resolve there" means, out of one
table rather than two. A config declaring `importBlock` alone brings `import-x` and nothing else; a
config declaring no gates needs neither, and `impact` reports on the structural rules that are
actually emitted.
