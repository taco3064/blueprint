---
"@kekkai/blueprint": patch
---

**The agent contract now says that test support sits outside placement.** An agent that
extracted a shared test helper into its own folder hit `undeclared-folder`, reverted, and
reported the only two options the contract knew about — declare a new layer, or keep the
duplication. `architecture.testFiles` had been the answer the whole time, and nothing the
agent could read mentioned it.

- **"Where code goes" names your own test globs**, rendered from `architecture.testFiles`
  rather than a hard-coded pair, so the line matches the repo it is written for. Declare
  `testFiles: []` and the line does not render — an exemption that exempts nothing is a
  door worth not pointing at.
- **It is a reporting instruction, not a third remedy.** An agent blocked on files that
  exist only to serve tests is told to say so and name them; widening the globs stays the
  owner's edit, and renaming a file to match them is called out as never being the fix.
  The remedies an agent may take itself remain two.

The escalation this changes is the cost of the question. "Declare a new layer for this"
reopens the architecture; "are these files test support?" is answered in three seconds.
