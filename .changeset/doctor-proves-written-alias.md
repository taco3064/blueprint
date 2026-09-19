---
'@kekkai/blueprint': patch
---

`blueprint doctor` now proves the Vite alias that `init` writes. The bundler-runtime and test-runner alias checks read `'<alias>': fileURLToPath(new URL('<dir>', import.meta.url))` and `path.resolve(__dirname, '<dir>')` / `resolve(__dirname, '<dir>')`, resolving `<dir>` from the configuration file's own folder. When Vitest is installed and no `vitest.config.*` exists, the test-runner check reads the Vite config that Vitest uses instead of reporting the alias unverified. A check that still cannot prove an alias names the file it read, or says that no configuration file was found, and lists the alias forms it can prove.
