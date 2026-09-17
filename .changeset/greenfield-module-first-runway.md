---
'@kekkai/blueprint': minor
---

Distinguish greenfield from brownfield adoption. A proven-empty React or Vue application now starts from the framework preset's complete canonical governance under either topology: `init --topology module-first` scaffolds `reactPreset` / `vuePreset` with `modules: []` instead of an authoring playbook, and invents no domain module. Existing source keeps the conservative authoring path that translates house thresholds and ratchets pre-existing debt.

`architecture.modules: []` is now a valid module-first runway. Topology follows the presence of `modules` across validation, resolution, lint emission, `inspect`, `deps`, `doctor`, `impact`, handbooks, Agent contracts, and guarded transformation. `reactPreset()` and `vuePreset()` accept a `modules` option that projects the same canonical governance onto module-first, with each module root at the container position and route composition in the reserved `app` module.

Generated module-first handbooks and Agent contracts carry a module growth protocol for future requirements: a temporary layer-first projection for reasoning only, container/use-case seeds, merge and split decisions, then `Module → Layer → Unit` with `dependsOn` derived from real imports. The documentation explains greenfield and brownfield posture and includes a measurement-first prompt for tightening a brownfield config.

The `@kekkai/blueprint/operational-contract` renderers stay source-compatible. `renderFreshScaffoldNote` also accepts `{ files, threshold, topology }`, `renderAuthoringFlowBanner` also accepts `forcedExit`, and `renderVerdict` accepts an optional `next`. The positional `renderFreshScaffoldNote(files, threshold)` form and `forcedBelowThreshold` still work and are deprecated.
