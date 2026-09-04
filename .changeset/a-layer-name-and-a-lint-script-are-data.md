---
"@kekkai/blueprint": patch
---

**A `$` in a layer name or in your existing `lint` script is now inserted as data, not
read as a replacement pattern.** Two substitutions handed adopter text to
`String.prototype.replace` as the *replacement* argument, where `$$`, `$&`, `` $` `` and
`$'` are a pattern language rather than literal characters, so a `$` sequence rewrote what
got substituted. Both now insert the text verbatim.

- **A layer name carrying a `$` produced globs addressing a path no file is at, and
  nothing went red.** `price$$tag` emitted `src/price$tag/**/…`; ``a$`b`` emitted
  `src/asrc/b/**/…`, with the glob's own head spliced into the middle of it. **Inside the
  emitted config that substitution only ever produces a `files` net, never a rule or a
  key**, so the corruption lands on scope rather than on content: the dependency-flow
  bans and the `relative-escape` `layouts` / `entries` keys are built from the raw layer
  name and keep the correct spelling. Resolve the real config for a file in a `$` layer
  before the fix and both `no-restricted-imports` and `blueprint/relative-escape` are
  **absent**; after it, both are there. **Enforcement over the `$` layer's own code was
  silently vacuous** — the rules were emitted, they simply matched nothing. One emitted
  config could carry two spellings of one layer name at once.
- **It reached past the emitted lint config.** The same globs are what `inspect` measures
  coverage against, what `doctor` picks its per-layer probe from, and what `impact` hands
  to a real ESLint run — so `inspect` counted the layer's own files as outside every net,
  `impact` reported no findings for them at all, and `doctor`'s merge-survival check
  probed a path no file is at and passed green over an entry that really had replaced
  that layer's rules. All three are repaired by the same one-line fix.
- **`blueprint init` could write a `package.json` that no longer parses.** With an
  existing `lint` script carrying a `$` sequence, the patched manifest was corrupt:
  `echo $&` produced unescaped quotes inside a JSON string, and `tsc && echo $'` and
  `` a $` b `` spliced the file's own tail or head into the value. Three of the four
  sequences threw on `JSON.parse`, and the file was written to disk without a parse
  check; `a $$ b` parsed and quietly lost a `$`. **No validator could have caught these**
  — npm hands a script to the shell verbatim, so all four are legal inside one.
- **Who was exposed at the second site.** Only a first adoption that took the scaffold
  fork — `init --preset`, or a repo under the brownfield file threshold — carrying a
  `lint` script that does not already mention `eslint`, in a pretty-printed
  `package.json` holding exactly one such `"lint": …` line. The patch needs the
  colon-space to find its needle and needs that needle to be unique: a minified manifest,
  or a second identical `lint` line, falls through to an instruction and is never
  written. A brownfield first `init` never reached it.
- **Nothing else moves.** Output for every `$`-free layer name and lint script is
  byte-identical: the emitted lint config, the handbook and the agent files were
  rendered across the vue, react and next presets before and after, with no difference.
  The `package.json` patch is still a single-line splice, so your indentation, key order,
  sibling scripts and trailing newline all survive.
- **No configuration is newly rejected.** `architecture.layers[].name` accepts exactly
  what it accepted before. A `$` in a layer name was legal and stays legal — it no longer
  corrupts what is emitted, which is the validator's own criterion.
- **Anything to do after upgrading? For a layer name, no.** The generated
  `eslint.config.mjs` is a thin wrapper that calls `emitLint(blueprint)` at lint time, so
  the corrected globs apply on the next lint run with nothing to regenerate. **For
  `package.json`, check `scripts.lint` once** if a first `init` through the scaffold fork
  patched a script carrying a `$`: three of the four sequences broke the manifest loudly
  at the time, but `a $$ b` parsed and silently dropped a `$`, and upgrading does not
  repair a file already written.
