---
'@kekkai/blueprint': minor
---

Blueprint 4.1 separates proven-empty greenfield adoption from brownfield adoption. A proven-empty React or Vue application, Next.js aside, can enter layer-first or module-first directly from the framework preset's complete canonical governance, and module-first opens with `modules: []` instead of an invented domain model. Existing projects keep the source-sensitive adoption rules: measured brownfield source can enter authoring, while the existing layer-first preset paths remain available where their current conditions apply.

Adoption is no longer one-way. `blueprint upgrade` and `blueprint remove` are first-class lifecycle operations backed by explicit evidence: `upgrade` resolves the repository-wide lifecycle plan before it starts the upgrade, while `remove` computes the complete de-adoption plan before applying it. Both fail closed when required facts cannot be proven instead of guessing.

Deterministic migration still does everything Blueprint can prove, and the semantic judgment that remains is an explicit, recorded step for a person or coding Agent. An upgrade completes only when `blueprint inspect --baseline` and `blueprint doctor` pass in every adopted application, never because lifecycle state says it should.
