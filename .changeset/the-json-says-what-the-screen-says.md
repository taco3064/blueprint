---
"@kekkai/blueprint": patch
---

**`doctor --json` carries the banner and the ratio behind it.** The text channel says
`⊘ Adoption unverified — 6 of 7 checks passed, 1 could not run`; the JSON said
`"ok": true, "verdict": "unverified"` and left the sentence and the numbers on screen. A
machine that read `ok` and stopped saw a plain green. `summary` is now the same line
byte-for-byte, and `counts` carries `{ total, passed, failed, skipped }` — so
`counts.skipped > 0` is a gate, and no reader of the JSON learns less than a reader of
the screen.

`ok` stays what it has always meant — nothing FAILED, which is exactly what this
command's exit code means. The field's other suggestion was to flip it, and that is the
half to refuse: a consumer following `ok` would start failing on a skip, and a skip is
deliberately not a failure because the state that produces one — an eslint config that
cannot resolve on a machine with no registry — is a red nobody can appease.

**The merge-survival check stops calling a generated config merged.** Its label was
hardcoded to "the merged eslint config", and on the path where init writes the live
`eslint.config.mjs` itself nothing was merged. An adopter read the word against its own
repo, found no merge, and went to check the check was pointed at the right file. `detect`
already separates init's own generated config from a hand-maintained one that wires the
package in, so the label reads that: "generated" or "merged", in the ✓ and in the skip.

**And when it cannot resolve the config, it quotes the loader.** "It would not resolve"
was the same swallow as `impact`'s carrier loader, fixed there one batch earlier and not
swept to here — so three runs went to `npm run lint` to learn WHICH package was missing.
The skip now names it, plus the one thing that follows from it: a package named there and
missing from `package.json` too means init's install step never completed. This is the
channel an agent reaches after interrupting that install, and the only one still on
screen when the question gets asked.
