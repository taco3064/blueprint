---
'@kekkai/blueprint': minor
---

Clean-repo honesty round, from two zero-debt field adoptions. tsconfig reading (doctor's alias check, survey's alias detection) now parses JSONC — the Vite + TS starter ships commented tsconfigs, so JSON-or-bail false-redded the mainstream path. `impact` labels rows whose rule id is not in the emitted config as isolation artifacts (existing disables referencing the project's own rules), renders them apart, and excludes them from the wiring-red total. `inspect --update-baseline` no longer records info findings — a missing-layer note is "not built yet", not debt; an all-info repo converges to "no baseline needed" instead of inviting manufactured debt.
