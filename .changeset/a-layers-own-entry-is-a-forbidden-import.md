---
"@kekkai/blueprint": patch
---

Enforce architecture bans against a layer's bare entry import, such as `~app/pages`, in
addition to imports below that entry. This closes gaps in dependency-flow, same-layer, and
`selfOnly` re-export enforcement across every configured alias.

Upgrading may reveal imports that `inspect` already considered invalid but ESLint previously
missed. Projects that manually merged Blueprint's generated `no-restricted-imports` groups
should refresh those copied groups and run `blueprint doctor`.
