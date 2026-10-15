---
"@kekkai/blueprint": minor
---

Add opt-in `architecture.consumerFiles` for explicit external consumers in module-first projects. Declared files outside `sourceRoot` may consume governed source without an uncovered-source finding; governed source depending back on them remains an error. Omitted and empty declarations preserve existing behavior. No preset infers consumers from tool names.
