---
'@kekkai/blueprint': minor
---

Doctor's merge-survival check no longer goes blind on empty repos — the anti-false-green gap field batch 7 called ironic. A layer with no files yet gets a synthetic probe derived from its own globs (`calculateConfigForFile` resolves by pattern and never touches the filesystem), so a gutted config turns red with zero files on disk; globs the synthesis cannot honor simply yield no probe. The authoring playbook gains an early-exit clause: on a repo at or below the preset threshold whose shape a preset fits, `init --preset` is a legitimate verdict — walking the full method on a starter is ceremony, not judgment. Docs show the `{ ...reactPreset(...), emit: {...} }` spread, since `emit` is a top-level blueprint field, not a preset option.
