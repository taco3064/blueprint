---
"@kekkai/blueprint": patch
---

Prevent commands from hanging when a configured glob or `.gitignore` pattern contains an
unmatched `{`; it is now treated as a literal brace.

`inspect`, `rules`, `doctor`, and `deps` now also identify `testFiles` entries that match no
files, while `doctor` reports ineffective `layerFilesIgnore` entries. These diagnostics are
informational and do not change exit codes. JSON output gains the corresponding conditional
`testExemption` details.
