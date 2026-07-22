---
"@kekkai/blueprint": minor
---

Field issue #5: `init --agent claude` now PERSISTS the choice — a scaffolded
config carries `emit: { agents: ['claude'] }`, so the first run emits one
contract and the next plain init cannot grow the second one back; the
chicken-and-egg (config must exist before you can narrow it) is gone. The
catalog closes the last bundle-eval of the round: `unusedVars` is named as
TWO rule keys on TypeScript, every optional gate is stated to scope to the
layer globs only, and merge guidance says collisions are decided by rule
KEY (`blueprint rules --json` names them), not by hit count.
