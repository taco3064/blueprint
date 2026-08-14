---
"@kekkai/blueprint": minor
---

**`blueprint rules` reports the config it actually emits, under modules too.** Its
per-layer ban table was module-blind: it built alias bases without the module segment,
mapped over the declared layers with no module dimension, and rendered selfOnly selectors
from the unscoped base — while its own doc claimed it worked "from the same primitives
emitLint uses".

So on a modular repo it printed `~app/contexts/…` where the emitted config carries
`~app/Fighter/contexts/…`, and reported one ban set per layer where the config holds one
per (module, layer).

**That is a wrong paste, not a stale report.** `blueprint rules --json` carries a
`jsLiteral` field whose whole purpose is being pasted into a hand-merged eslint config, and
the authoring playbook sends an adopting agent to it in four places. Following that
instruction on a modular repo installed a selector matching nothing, with lint green over
it — the failure the self-explaining-output doctrine exists to prevent, arriving through
the one channel it names as guaranteed.

- **One row per emitted entry**, addressed `Fighter/contexts` in the text report and keyed
  `module` beside `layer` in `--json`. Two modules' rows are different strings, and the
  report now says so rather than printing them alike.
- **The selectors carry the module segment**, from the same primitive `emitLint` and
  doctor use — the third caller joining the other two instead of deriving the address
  again.
- **The playbook's granularity claims point at the output** instead of asserting a shape.
  It is rendered before a config exists, so it cannot know whether the repo will be
  modular; a sentence claiming either is a claim about the adopter's repo that the tool
  cannot see from there.

Flat configs are unaffected: `blueprint rules` output is byte-identical, text and `--json`,
across seven configurations including all three presets and a layer name longer than the
table's fixed column.
