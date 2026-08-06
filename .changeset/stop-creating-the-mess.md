---
"@kekkai/blueprint": patch
---

**The build the playbook asks for no longer emits a bundle where the bundle proves
nothing.** The checklist offered `npm run build` or `npx tsc -b` as equals. On a repo whose
layers hold no files they are not equals: neither can prove the alias resolves (nothing
imports through it yet), both catch an edit that broke the config outright, and only the
first drops a `dist/` into a working tree that may have nowhere to put one.

That artifact was the most-repeated item in the entire field campaign — fifteen mentions
across every batch, each one an agent correctly following guidance about what to do with a
file the playbook's own first-listed command had just created. Every round the wording for
handling it got better. This round it stops being created: on the empty-layer path the
playbook prefers `tsc -b`, and says when the full build is the right one instead (a vite
config outside every tsconfig project, or layer files that genuinely exercise the alias —
there the bundle is the point).

**Ignore rules and version control are two facts, not one axis.** The artifact branch read
"leave them to the repo's own ignore rules, and when the repo has none — including a repo
under no version control at all". That collapsed two independent questions, and a field repo
landed exactly between them: a `.gitignore` that lists `dist`, in a tree that is not a git
repo, so the rule has nothing to enforce it. The branch had no cell for that combination.
It now names all four and asks the report to say which one it is — a `.gitignore` under no
VCS is a rule with nothing behind it; no `.gitignore` under git means the artifacts show up
in `git status`; neither means "untracked" describes every file and the word stops
distinguishing anything.
