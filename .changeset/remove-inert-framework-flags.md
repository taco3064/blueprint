---
"@kekkai/blueprint": patch
---

Removed the inert `--framework` flag from `impact`, `doctor`, and `rules`
(and the corresponding option from their TypeScript options types). All
three commands require — or resolve — an existing config, and `framework`
only ever steered the no-config preset fallback, so the flag never had any
effect; documenting it was a lie waiting to confuse an agent. `init`,
`inspect`, and `deps` keep theirs — there the no-config path is real.
