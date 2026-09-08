---
"@kekkai/blueprint": patch
---

Preserve `$` sequences literally when generating layer globs and updating an existing
`package.json` lint script. Configurations such as `price$$tag` now govern the intended
folder, and `blueprint init` no longer risks corrupting valid scripts containing `$`.

After upgrading, projects with `$` in a layer name may surface architecture findings that
were previously missed. If an earlier scaffold run modified a lint script containing `$`,
check that script once because upgrading cannot repair an already-written manifest.
