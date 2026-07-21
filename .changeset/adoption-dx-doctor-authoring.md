---
'@kekkai/blueprint': minor
---

Adoption DX — from a fresh vite react-ts field report. The preset path's
finishing work (wire, verify) is now first-class commands, not stdout to
remember.

- **`blueprint doctor`** — a new read-only command answering "is adoption
  finished?" as a checklist (config present, no leftover `*.blueprint.*`
  reference files, eslint wired to emitLint, architecture clean under the
  baseline). Exit 0 only when all pass, so it drops into an agent verify loop
  or CI. Makes the adoption prompt's acceptance clause executable.
- **`init --authoring`** — the symmetric escape hatch to `--preset`: force the
  authoring playbook even on a repo below the file-count threshold (which would
  otherwise scaffold a preset). The two are mutually exclusive. The preset
  branch now narrates plainly that no `blueprint-authoring.md` is written on
  that path — so an agent told to execute it no longer hunts for a missing file.
- **Legacy `.eslintrc` is detected** instead of silently getting a fresh flat
  config written next to it (which produced two configs / two ledgers). It now
  routes to the reference + a flat-config-migration note.
- **Shape-aware eslint wiring** — the merge instruction is tailored to the
  existing config's shape (`tseslint.config()` wraps the spread; a flat array
  takes it directly; legacy migrates first) rather than one generic snippet.
- **knip is no longer installed by default** — zero-config knip false-flags, so
  shipping it pre-installed-but-commented was a dangling promise. It is now an
  opt-in recommendation, matching how stylelint is handled.
