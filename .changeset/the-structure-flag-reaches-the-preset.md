---
"@kekkai/blueprint": minor
---

**`blueprint init --structure flat|modular`** — the CLI surface for the preset option
that landed without one. `modular` writes a config that declares it; `flat` writes what
init writes today, byte for byte, because it is the preset default and declaring a
default only restates it.

```
blueprint init --structure modular   →  export default vuePreset({ name: 'demo', structure: 'modular' });
blueprint init --structure flat      →  export default vuePreset({ name: 'demo' });
```

**Nothing changes for a run that does not pass it.** A greenfield tree still defaults to
flat, nothing refuses, and no new folders are scaffolded.

- **A bad value exits 1 naming both, rather than falling back.** `--agent`'s precedent,
  not `--framework`'s: a silent fallback writes a flat config for someone who typed
  `modular`, and the config is the artifact they will not re-read. `init --structure`
  with nothing after it is the same error.
- **A re-run over an existing config does not re-decide.** The flag is read only when
  init generates the config; an existing `blueprint.config.mjs` answers the question with
  its own `architecture.modules`, and a flag contradicting it is not a tie to break. The
  run does not fail either — there is nothing to fail about.
- **On a Next.js project `modular` is refused and `flat` is accepted.** `flat` is the
  shape `nextPreset` already builds, so it is answered rather than refused; `modular` has
  no Next layer list to land in. The refusal is `nextPreset`'s own text, prefixed with the
  one fact only the CLI path knows — that a run which never named Next resolved the Next
  preset. One text, two doors, so the two cannot drift into different answers.
- **`init --authoring` still recognises a modular scaffold as init's own output.** The
  pristine check enumerates everything the config generator can produce, and a new axis
  missing from that list makes `--authoring` refuse a config init wrote seconds earlier.
  The axis has two outputs rather than two values: `flat` writes no field, so it is the
  same candidate as an unflagged run.
