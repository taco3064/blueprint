---
"@kekkai/blueprint": patch
---

**`blueprint rules` claimed a comparison scope wider than `doctor`'s own check admits.**
The per-layer bans block closed with "Everything below is what doctor compares" — and the
block below it prints a `packages:` column, while doctor's ✓ on the same repo says
"package-ownership entries … are not compared".

Two live command outputs, opposite instructions for the same decision: someone folding
blueprint's entries into a house config reads `rules` and skips the `--print-config` pass
the playbook asks for precisely *because* doctor cannot see that column — so a merge that
drops a package ban stays green.

`rules` now names its own columns rather than restating doctor's scope: `no-import`,
`globals` and the selfOnly selectors are what doctor compares, `packages` is not, and the
line says what to do about the one that is not — verify that column with
`npx eslint --print-config`. The scope belongs to the check that has it.

**`rules --json` carries the same sentence, on the ban entries that have a `packages`
column.** `bans[i].packagesNote` is the passage the text output prints, joined into one
sentence, so the two channels cannot drift apart — and the playbook sends a merging agent
to `--json` in five places, which makes that the channel this matters most in.

Both channels withhold it on the same condition: where no layer bans a package, there is
nothing to verify, so neither the field nor the paragraph appears.
