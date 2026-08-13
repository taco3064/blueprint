---
"@kekkai/blueprint": patch
---

**`inspect` now notes an `owns` entry whose package is not installed.** A new
`owns-not-installed` finding names the package and the layer that declares it, and says
that installing it and dropping the declaration are both resolutions.

- `info`, the same tier as `missing-layer` — declaring ownership ahead of the install is
  the legitimate order, so the ban is correct and simply has nothing to reach yet.
- Nothing about your gate changes: info findings do not set the exit code and are never
  written to the baseline. Owned globals are skipped.
- The authoring playbook no longer says `inspect` cannot see this.

`doctor` is unchanged.
