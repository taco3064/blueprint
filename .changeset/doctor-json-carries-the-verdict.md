---
"@kekkai/blueprint": minor
---

**`doctor --json` said `"ok": true` about a run whose text output said `⊘ Adoption unverified`.** The
skip that banner reports rides on `ok: true` deliberately — a skip is not a failure, and the exit code
follows `ok` — but `ok` is a boolean and the verdict has three states, so the two channels answered
differently about the same run. A field agent nearly took the JSON as a CI-usable green, then spent
five minutes cross-checking against the plain output and its own lint, which failed for the reason the
skipped check named.

`verdict` now carries the banner's three states — `complete`, `unverified`, `incomplete` — in the JSON
and on `runDoctor`'s return value, so automation reads one field instead of inferring from a per-check
array. `ok` keeps the meaning the exit code needs (nothing failed) and its type now says so.

The gap was in the fix that introduced the third state: `DoctorCheck.skipped` reached the JSON, and the
top-level summary of it did not.
