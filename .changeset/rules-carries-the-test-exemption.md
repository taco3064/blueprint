---
'@kekkai/blueprint': patch
---

**`rules` hands over the whole entry, not just its selectors.** Flat config
replaces same-key entries rather than merging them, so the merge guidance asks
an adopter to fold blueprint's `no-restricted-syntax` selectors into their own
entry, and points at `rules --json` for the exact strings. That output had the
selectors and nothing else — while the emitted block also carries
`ignores` exempting test files. An entry rebuilt from selectors alone has no
exemption, so it starts governing tests.

A field run lost it and spent a debug cycle on 34 errors in one test file. That
was the loud version, and only because the adopter's own rule happened to
collide on the same layer. Where nothing collides, the entry that quietly
reaches test files is blueprint's own selfOnly ban, behind a lint that stays
green — and doctor compares selectors, not scope, so nothing downstream
notices.

`rules --json` now carries `testExemptions` beside the selectors on every
layer, the text output prints the `ignores` line to paste under the selectors
to copy, and the playbook's merge section states that an entry is more than
its selectors, naming both how the loss shows up and how it hides.
