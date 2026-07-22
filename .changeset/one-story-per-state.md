---
'@kekkai/blueprint': patch
---

One story per state — sibling tools stop contradicting each other (field run #10):

- `doctor`'s architecture check only says "findings covered by the baseline"
  while a baseline is actually covering something. On a truly clean repo the
  label is plain `architecture clean` — matching `inspect --update-baseline`'s
  "no baseline needed" instead of claiming a ledger that does not exist. The
  red detail likewise drops "outside the baseline" when no baseline is in play.
- The size gate has one name and one number everywhere: `init`'s forced-
  authoring log line and `init --help` now say "brownfield threshold
  (10 source files)" — the playbook's term — instead of the unnumbered
  "preset threshold".
