---
"@kekkai/blueprint": patch
---

**The package no longer ships declarations for its test-only fixture DSL.**
`dist/conformance/conformance.d.ts` and `dist/conformance/index.d.ts` were in the tarball
because the tree they came from sat under `src/`, which `tsconfig.types.json` emits from.
That tree now lives in `test/`, so the two files are gone and every other file in `dist/`
is byte-identical.

- Never a public surface: `exports` declares `"."` only, so `@kekkai/blueprint/conformance`
  answered `ERR_PACKAGE_PATH_NOT_EXPORTED` at runtime and `TS2307` under `bundler`,
  `node16` and `nodenext`. There was no `.js` beside the declarations either — a runtime
  import could not have worked.
- One route did resolve, and it stops here: a `moduleResolution: node` (TS's legacy mode)
  consumer writing `import type { RepoSpec } from '@kekkai/blueprint/dist/conformance'`
  type-checked against the published package and now gets `TS2307`. Nothing in the docs
  ever named that path; it is called out because a deletion an adopter can observe belongs
  in the changelog rather than in a diff of two tarballs.

No runtime behaviour, no rule, and no emitted document changes.
