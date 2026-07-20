---
'@kekkai/blueprint': patch
---

- **init recognizes a wired config.** When the user's own eslint config
  already imports `@kekkai/blueprint`, init no longer writes a reference
  file next to it on every re-run — the owner wired it; there is nothing
  to merge, and the plan says so instead of nagging.
- **The Traditional Chinese documentation site is rewritten in formal
  register** — report-style prose throughout; general vocabulary is fully
  translated while proper nouns and identifiers stay verbatim.
