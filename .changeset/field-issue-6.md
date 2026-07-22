---
"@kekkai/blueprint": patch
---

Field issue #6 — three message-level frictions, zero behavior bugs: the
eslint merge hints now put `...emitLint(blueprint)` AFTER your existing
entries and say why (later entries win in flat config — the old hint walked
you into the exact override trap the playbook warns about); the generated
config's parser blocks carry a header saying they are live-config-only and
should be skipped when merging into a config that already wires parsers;
survey prints "— none —" under empty sections instead of a bare heading
that reads as a render failure.
