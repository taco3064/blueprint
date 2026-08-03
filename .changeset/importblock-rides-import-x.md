---
'@kekkai/blueprint': major
---

**`importBlock` now rides `eslint-plugin-import-x`.** The emitted rule ids
change from `import-lite/first` / `import-lite/no-duplicates` to
`import-x/*` — a merged config that overrides either one by name stops
matching, which is the whole of the breaking surface.

`import-lite` was chosen when the adoption baseline still included repos that
`import-x` could not install into: it peers on `@typescript-eslint/utils@^8.56`
for its resolvers, and a repo pinned below that failed the install as a whole
(field issue #41), while the original `eslint-plugin-import` caps its eslint
peer at 9 (#37). On an ESLint 10 baseline that trade reverses. No tree reaches
ESLint 10 while holding typescript-eslint below 8.56 — older typescript-eslint
refuses ESLint 10 as its own peer — so the population the guard protected is
now the repos already installing with `--legacy-peer-deps`, whose installs do
not abort on peer conflicts in the first place. `ALLOWED_CARRIER_PEERS` records
that as a deliberate entry rather than a widened hole, and says which
conformance fixtures would prove it wrong.

What the resolvers buy is the whole-graph family a resolver-free plugin
structurally cannot express, `no-cycle` above all. This release does not emit
it: cycles are a property of the graph, and `inspect` already walks that graph
once where a per-file rule re-walks it for every file. But a project that wants
the cycle red at edit time can now reach for it without adding a plugin — and
with `ignoreExternal` set, since the rule's default walks into `node_modules`
and a project with no cycles pays the most, having no early exit to find.
