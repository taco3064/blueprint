---
'@kekkai/blueprint': minor
---

`doctor` gains a sixth check — the declared import alias must be resolvable by the toolchain (tsconfig `paths` or the vite config), closing the declared-yet-unwired gap where the agent contract points at imports nothing resolves. `inspect` reports and doctor's architecture check now state their coverage (source files inside layer nets, active gated rules), so a vacuously green gate over an empty net is called out instead of quietly passing. `detectAliases` moved from `survey` into `project` alongside the new `pathAliasKeys`.
