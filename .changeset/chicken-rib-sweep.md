---
"@kekkai/blueprint": minor
---

Product-wide chicken-rib sweep — dead surface is gone, not deprecated:

- `architecture.flow` removed. It was a required field that nothing ever
  read — the layer ORDER is the flow. Existing `.mjs` configs keep working
  (the runtime ignores unknown properties); TypeScript-typed configs delete
  one line.
- `emit.lint.path` removed for the same reason: never consumed, while its
  doc claimed a consumer.
- `emitAgentContract` (and `AgentContractOptions`) left the package entry:
  the supported agent targets are the ones `emit.agents` names, and a
  render-it-yourself hatch for unsupported tools is surface without a
  mission. `emitAgentFiles` remains the one distribution API.
- `injectBetweenMarkers` left the package entry — an internal merge utility
  with no documented story.
- `plugin` stays, and its story is now stated in the reference: the escape
  hatch for hand-wiring a `blueprint/*` rule without `emitLint`.
