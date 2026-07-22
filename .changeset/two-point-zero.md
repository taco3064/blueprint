---
'@kekkai/blueprint': major
---

2.0.0 — the field-hardened release. Fifteen autonomous adoption rounds
(closed `field-run` issues #1–#15) drove every change since 1.14; the
loop converged when a full round reported zero tool defects, with every
suspicion an agent raised verified against the channels and retracted.

Breaking changes:

- **Config validation rejects unknown keys** across the structural path
  (blueprint, architecture, layers, allowedImporters entries, module,
  owns entries, emit). A key nothing reads was a silently dead
  declaration — a field repo shipped a `selfOnly` ban that never existed
  because the key sat one level too high. Configs carrying stray keys
  now fail loud with a pointed message.
- **`architecture.flow` and `emit.lint.path` are removed** (both were
  inert), along with the `retire` command, the `--framework` flag on
  `impact` / `doctor` / `rules`, and the never-documented entry exports
  `emitAgentContract` / `AgentContractOptions` / `injectBetweenMarkers` /
  `StructuralRule`.
- **`doctor` is stricter**: leftover authoring artifacts
  (`blueprint-authoring.md`, the command file) fail the leftover check —
  "Adoption complete" and the playbook now define done identically; a
  marker-bearing contract outside `emit.agents` already failed since 1.14.
- **The emitted CI workflow gates with `inspect --baseline`** (a missing
  ledger is an empty one) — locked brownfield debt no longer turns the
  tool's own CI permanently red.
- **`architecture.module.private` is optional** (omitted = none) — the
  one loosening.
