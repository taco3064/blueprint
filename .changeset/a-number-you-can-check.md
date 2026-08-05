---
"@kekkai/blueprint": patch
---

**A count the reader could not check, and a rule that named one of its two remedies.**

**`inspect`'s coverage line names the files outside the layer nets.** `272/275 source
files inside layer nets` reads identically whether the three are root wiring — outside
every layer by design — or a layer file that a mistyped glob dropped out of the net. A
field agent confirmed its globs by other means (`impact` running on layer files, then
`--print-config`) and said the number itself was not what told it. The names are now in
the line, capped at five: past that, mid-adoption on a brownfield repo, the list is the
whole repo and the count is the honest answer — which the line says rather than leaving
the naming to look broken.

**The agent contract says which of the two remedies belongs to the agent.** When code
lands outside a declared layer, `inspect` reports `undeclared-folder` and names two ways
out: declare the folder as a layer, or move the code into an existing one. Every contract
surface — the compact `CLAUDE.md` block, the full tool-owned rule files, and the
`agent-contract.md` shipped in the package — said only "do not create undeclared
folders". An agent reading nothing else contorts new code into a layer it does not belong
in rather than reporting that the architecture has outgrown the config.

Only the second remedy is the agent's. Declaring a layer is an architecture decision, the
same call the authoring playbook keeps away from an adopting agent — so all three now say
to report it and stop, and never to edit the architecture to fit code just written. That
is also the answer to a question this raised: a project that adopts early gets its layers
from a preset before any code exists, and what keeps the config honest as the code grows
is exactly this finding — a red on the first folder that does not fit, with both remedies
named and attributed.
