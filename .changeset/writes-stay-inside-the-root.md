---
"@kekkai/blueprint": patch
---

**`init` writes only inside the repo it runs in.** `emit.handbook` and
`emit.agents[].path` are adopter-supplied strings that reached `fs` unchecked, so
`emit.handbook: '../HANDBOOK.md'` wrote one directory up and an absolute path wrote
wherever it pointed — both with `✓ write:` printed beside the escaping path.

Not a privilege boundary: `blueprint.config.mjs` is imported, so a config that can
spell `../` can already call `fs` itself. Two other reasons stand on their own.
`SECURITY.md` puts "anything outside the project root" in scope as a vulnerability,
so the tool was contradicting a boundary it had written down. And blueprint's pitch
is that an *agent* authors the config, which makes the realistic input a relative
path off by one directory in a monorepo — a mistake that used to succeed silently.

Refused in the **planner**, so the whole run is rejected before a single write and
`--dry-run` cannot print a plan the real run would reject; `apply` checks again,
because it is the last thing between an action list and the filesystem however that
list was built. The refusal names the path, that nothing was written, and the two
config fields that set one.
