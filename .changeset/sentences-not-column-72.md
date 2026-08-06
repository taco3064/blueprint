---
"@kekkai/blueprint": patch
---

**The authoring playbook now breaks its lines at sentences instead of at column 72.** The
document renders identically — markdown reflows, so nothing an adopting agent reads changes in
meaning, order or wording. What changes is that a sentence is now a line: `grep` for a phrase
that used to straddle a wrap ("belongs to the project's own lint", "Never invent a layer") finds
it, and a one-word correction is a one-line diff instead of a re-wrapped paragraph. The
below-threshold playbook goes from 828 lines to 410, with the median line length moving from 71
to 82 characters.

Nothing about the content moved. The change was verified against the previous release's output
with four structural invariants rather than a byte comparison, since bytes are expected to
differ: every paragraph, fence, blockquote and list marker is preserved, code blocks are
byte-identical, list continuations still reach their marker's content column, and flattening both
sides to normalized prose gives an exact match across all eight conditional combinations — no
word added, lost or reordered.
