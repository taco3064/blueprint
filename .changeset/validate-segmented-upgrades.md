---
'@kekkai/blueprint': patch
---

Reject an upgrade catalog when any represented release checkpoint has an unresolvable semantic-operation graph, even if a later release cancels or supersedes the broken operations and makes a direct jump to the current package version resolve. This keeps staged upgrades from reaching an intermediate dependency cycle or canceled requirement that final-target-only validation would hide.
