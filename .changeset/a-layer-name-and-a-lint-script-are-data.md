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
  `src/asrc/b/**/…`, with the glob's own head spliced into the middle of it. The layer
  file nets, the dependency-flow bans and the `relative-escape` `layouts` keys all
  compile from the same place, so **enforcement over that layer was silently vacuous** —
  the rules were emitted, they simply matched nothing. A single emitted config could
  carry two different spellings of one layer name at once.
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
  `package.json`. A brownfield first `init` never reached it.
- **Nothing else moves.** Output for every `$`-free layer name and lint script is
  byte-identical: the emitted lint config, the handbook and the agent files were
  rendered across the vue, react and next presets before and after, with no difference.
  The `package.json` patch is still a single-line splice, so your indentation, key order,
  sibling scripts and trailing newline all survive.
- **No configuration is newly rejected.** `architecture.layers[].name` accepts exactly
  what it accepted before. A `$` in a layer name was legal and stays legal — it no longer
  corrupts what is emitted, which is the validator's own criterion.
