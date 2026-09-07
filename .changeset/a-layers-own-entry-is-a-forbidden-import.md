---
"@kekkai/blueprint": patch
---

**A layer's own entry is now matched by the bans that were always meant to cover it.** Three
emitted patterns matched a forbidden layer's *descendants* and not the layer itself, so
`~app/pages` — the entry, resolving to `src/pages/index.ts` — was a legal spelling of an
import the blueprint forbids. `inspect` reported every one of these all along, and the
rules catalog recorded which ESLint rule enforced them; for the bare entry those records
were false. **inspect went red, lint stayed green, and the gate that runs in CI was the one
that missed it.**

- **The dependency-flow ban** now covers `~app/<forbidden-layer>` as well as everything
  under it — through every alias you declare, not just the first, and for every forbidden
  layer, not just the first.
- **The same-layer ban** likewise, under both `flat` and `folder` module layouts.
- **The selfOnly re-export ban** likewise: `export * from '~app/contexts'` and
  `export { a } from '~app/contexts'` are now reported, where before only
  `~app/contexts/theme` was.

**What you will see on upgrade: lint may report imports it previously let through.** That is
this fix working, not a new rule. The rule you declared always forbade those imports,
`inspect` has been reporting them, and the catalog already claimed lint enforced them — a CI
run that starts failing here was failing the architecture before, silently. Fix the imports,
or change the layer declaration that forbids them.

**The same-layer message now states its own extent**, because its remedy named a shape the
bare spelling does not have:

> Same-layer imports must be relative. "~app/services" and everything under it is banned.
> Replace "~app/services/X" with "./X".

**Nothing else moves.** Which imports are forbidden is unchanged — only which spellings of a
forbidden import are matched. The entry-only exemption for folder-layout modules is
deliberate and intact: `~app/hooks/useX` stays importable while `~app/hooks/useX/impl` does
not. A folder whose name merely starts with a layer name — `~app/pagesx` — is still not
matched. `inspect`'s findings are unchanged in either direction.