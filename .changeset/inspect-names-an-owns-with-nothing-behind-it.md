---
"@kekkai/blueprint": patch
---

**`inspect` now notes an `owns` entry whose package is not installed.** Declaring
ownership before the install is the legitimate order — the ban is emitted and correct,
it simply has nothing to reach yet — so this is an `info` note, the same tier and the
same doctrine as `missing-layer`. It was found by a repo that declared
`owns: ['matter-js']` from its first commit and went four issues without the package,
through green runs the whole way, with no surface ever mentioning it.

- **`owns-not-installed`** names the package and the layer that declares it, and says
  that installing it and dropping the declaration are both resolutions. Two layers each
  owning the same absent package are two notes, because the address to go to differs.
- **Nothing about your gate changes.** Info findings do not set the exit code and are
  never written to the baseline, so a repo in this state stays green and accrues no debt.
  Owned globals have no dependency list to answer to and are skipped.
- **The authoring playbook stops saying `inspect` cannot see this.** It described three
  shapes of runway and claimed only the first was reported; two are now, leaving an alias
  no import uses yet as the one shape you still have to recognize yourself.

`doctor` is unchanged. Ownership declared ahead of the install is most legitimate at
adoption, which is exactly when `doctor` runs — this becomes worth saying later, and
`inspect` is the surface that is still there later.
