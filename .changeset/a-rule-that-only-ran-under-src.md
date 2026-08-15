---
'@kekkai/blueprint': patch
---

**`blueprint/relative-escape` did not run at all on a project whose `sourceRoot`
is not literally `src`.** It did not error and it did not warn: the rule located
your layers by searching the file path for a directory named `src`, found none,
and registered no visitors. Green lint, no rule.

The emitted config was never the problem — `emitLint` scoped the entry with your
root, so ESLint handed the rule exactly the right files and the rule declined to
look at them. What made it hard to read from the outside is that **`inspect`
still reported.** Its half of the same check reads coordinates `scan` already
resolved, so the identical import was an error there and silence in lint, with
nothing on either side explaining the split — and the likelier reading of that
pair is that lint is right and `inspect` is noisy.

Who was affected, in the order it is likely to matter:

- **`nextPreset` without `srcDir` emits `sourceRoot: '.'`**, so a Next adopter on
  the preset default has had this rule dead since it shipped.
- Anything rooted at `lib/app`, `app`, or any other directory — documented public
  configuration, with `.` called out in the reference for frameworks that keep
  layers at the project root.

**The fix passes the root the config named**, next to the `depth` already passed
for the same reason: the plugin ships inside your config and cannot read it, so
anything it would otherwise guess is handed to it. A project rooted at `src`
emits `sourceRoot: 'src'` and every verdict it reaches is the one it reached
before.

**One limit worth stating, because it is a deliberate trade.** Under
`sourceRoot: '.'` the file's layer is the only anchor in the path, so a directory
*above* your project named exactly like one of your layers — `/work/services/my-app`
with a `services` layer — is read as that layer. That is a wrong reading where
today's behaviour is no reading at all, which is the direction this issue argues
for: a gate that is silent cannot be argued with.
