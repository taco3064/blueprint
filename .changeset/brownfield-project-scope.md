---
'@kekkai/blueprint': patch
---

Discover root-level TypeScript applications and aliases declared in referenced configs during
brownfield survey, preserve conventional `src/` scopes, require an explicit application scope
for multi-app workspaces, resolve aliases that target individual architecture layers, and use a
nested application's own TypeScript and Vite configuration when `architecture.sourceRoot`
scopes Blueprint below the repository root. Keep authoring output and CLI help consistent with
the required application-scope decision.
