---
'@kekkai/blueprint': patch
---

`defineBlueprint()` and config loading now enforce two requirements the documentation and types already stated: `framework` must be `'vue'`, `'react'`, or `'auto'`, and every layer needs a non-empty `does`. A hand-written JavaScript config that omitted either, or set `framework` to another value, used to load; it now fails with an error naming the field to fix.

`blueprint init --help` no longer tells a multi-application workspace to pass `--source-root` to `init`, which rejects that flag. It points to `blueprint survey --source-root <path>` instead.
