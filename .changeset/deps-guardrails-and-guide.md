---
'@kekkai/blueprint': patch
---

`deps` guardrails + a dedicated guide page.

- A hand-written `blueprint.config.mjs` that bypasses `defineBlueprint` is now
  validated on load: structural mistakes fail with a precise
  `blueprint.config.mjs: <reason>` message (missing default export included)
  instead of an undefined-property crash deep inside a command. Applies to every
  config-loading command (`init` / `inspect` / `deps`).
- The `deps` leaderboard lists source folders that sit outside the declared
  layers instead of silently ignoring them, so zero fan-in can't be misread as
  "nobody imports this"; querying into such a folder names the actual cause.
- Flat-layout layers are annotated (`(flat layer — answers at layer
  granularity)`) wherever they appear, so the granularity collapse is visible
  instead of silent. Leaderboard JSON now carries `{ modules, skipped }`.
- New docs page "Blast Radius — deps" (en + zh-TW): how to run it, sample
  outputs, granularity via `module.layout`, and the graph's boundaries.
  `deps --help` grew a matching scope-and-granularity section.
- Philosophy section now states its relationship to the tool explicitly: the
  Operating Contract opens with "this documents the preset payload", and every
  sub-page (beliefs / layers / component-shape / discipline) carries an
  "In blueprint" connector naming the config field it compiles from
  (`principles` / `architecture` / `componentShape` / `playbook`) and where it
  lands; Getting Started links the preset paragraph back to Philosophy.
- New "Feature Overview" docs page (en + zh-TW): every capability listed with a
  one-line description, each linking to its how-to page — now the Guide nav
  entry and the first sidebar item; the four home-page cards link to the
  matching generated-artifact sections.
- Docs coverage sweep (en + zh-TW): new "Checks & Config Reference" page (all
  nine `inspect` finding kinds, the six embedded plugin rules, the gated
  `blueprint.rules` ids, config fields beyond the quick-start example, the full
  CLI flag matrix incl. `init --preset`) and new "What init Generates" page
  (verbatim artifacts from a fresh init). Layer Architecture grew an
  "Ownership — `owns`" section; `inspect --help` now also names the
  `missing-layer` info finding.
