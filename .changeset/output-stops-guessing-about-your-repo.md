---
"@kekkai/blueprint": patch
---

**The authoring playbook and the CLI output stopped making claims about your repo they
cannot check.** This is the bulk of the release: roughly thirty statements that were
asserted, or that two outputs answered differently, replaced by a measurement, a condition,
or nothing.

The ones you would actually notice:

- **Which build to run is read from your tsconfig graph**, not argued about in prose. The
  playbook used to assert that a Vite + TS starter keeps `vite.config.ts` inside a tsconfig
  project — false on the common starter shape, and it invited an agent to report a verified
  alias edit that `tsc -b` had never read. It now names your file, says whether `tsc -b`
  covers the vite edit, and where it cannot tell, says to go and look.
- **The build-artifact cleanup instruction reads your repo**: whether `tsc -b` writes
  anything into your working tree at all, and whether ignore rules and version control are
  there — two separate facts, not one axis, with the "decide it yourself" cell reduced to
  the case where nothing in the repo settles it.
- **`.claude/` is measured before it is described.** The playbook used to tell an agent to
  delete a directory init had created — false on any repo whose owner already uses Claude
  Code, and it now says which of the two it found, including when your own command files
  are sitting in it.
- **The cleanup list is the same list everywhere it appears**, including the banner that
  opens the document, which named two files where the other three sites named five things.
- **A finding about a directory addresses the source root your config named**, not a
  hard-coded `src/`.
- **`impact`'s "not blueprint's rules" block says what those rows are** — a name your code
  mentions in a disable comment that this isolated run cannot resolve, reported at the
  comment. So the count counts mentions, not violations, and it says nothing about the code
  under one.
- **A re-adoption is told that regenerated wording is a newer build, not drift** — and that
  equal version strings do not rule that out, since a linked checkout, an unreleased tree
  and a git dependency all report the last release while emitting later text.

The rest are the same shape at smaller scale: a claim that needed a condition got one, and
a proof step that overstated its reach now states it. Individually none of them changes
what you do; together they are the difference between an adopting agent writing a true
report and a confident one. (Where two outputs contradicted *each other* rather than the
repo, that is its own entry.)
