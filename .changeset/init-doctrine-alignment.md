---
"@kekkai/blueprint": minor
---

Init now lives by its own doctrine (field batches 10–11): empty layer folders
are scaffolded only into an empty source tree — where code already lives, an
unbuilt layer's absence is its true state, no `.gitkeep` shells. Narrowing
`emit.agents` makes the next init remove a stale agent contract that is
wholly its own output (nothing outside the marker block; own-strategy rule
files by construction) — a hand-edited file only gets told. And
`validateBlueprint` now returns the blueprint instead of `void`, so a passing
call is visible at runtime.
