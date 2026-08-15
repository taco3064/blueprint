---
'@kekkai/blueprint': patch
---

**The relative-escape message named `src/` as a literal, on both gates, whatever
root your config declares.** On a project rooted at `app`, `lib/app`, or `.` the
remedy pointed at a directory the repo does not have — and a remedy naming a
folder an agent cannot find reads as the tool being broken rather than as the
import being wrong.

The tool was already contradicting itself about this one screen apart. `inspect`
prints the finding and its migration line together, and the migration line for
`src-escape` has always read *"Replace relative paths that climb above the source
root…"*. So a moved-root project got a finding citing `src/` beside a remedy
citing the concept, with nothing to say which was right.

**Both halves now name the root the config declares**, from one function:

- `sourceRoot: 'src'` — unchanged, to the byte. `escapes src/`.
- `sourceRoot: 'app'` / `'lib/app'` — `escapes app/`, `escapes lib/app/`.
- `sourceRoot: '.'` — `escapes the source root`. There is no root folder to
  cite, so none is invented; this is the spelling the reference and the remedy
  line already use. `nextPreset` emits this root whenever `srcDir` is false, so
  it is a default path rather than an exotic one.

The name is derived from the same read the *comparator* uses, not from the
config string, so a message can only name a spelling that actually matched:
`./app` is matched as `app` and is named `app/`.

**The finding id does not move.** It is still `src-escape` on every root —
published across six documentation pages, keyed on by `--baseline`, and mapped
to its rule by `inspect`'s own table. This release changes the sentence, not the
identifier, and the same holds for the rule's `messageId` (`escapesSrc`).

**Both gates or neither.** Lint and `inspect` already reached one verdict through
a shared `relativeVerdict`; they now reach one *sentence* through a shared
`sourceRootName`, and a test pins the lint text to contain the finding's
verbatim. Two gates agreeing on the verdict while their sentences disagree is
the same drift wearing a quieter coat.

**The class is closed, not the paragraph.** These two messages were the only
output naming a directory the config can move. The other four relative verdicts
name a layer, a module, or an entry — all computed already — and the reference
pages, the migration line and `report.ts` were root-neutral before this change.
