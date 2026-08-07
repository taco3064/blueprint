---
"@kekkai/blueprint": patch
---

**The ESLint major `init` resolves you to is now one this project runs its suite on.**

`init` installs `eslint` unpinned, so you land on the newest major every carrier's peer
range admits — a field run measured `^10.8.0` arriving that way. Until now, the version
you land on was the one version never executed here: this package develops against 9,
and nothing ran 10. Both majors are covered now, and by the whole suite — including the
scenarios and `impact`, which resolve a real config with a real ESLint rather than
asserting about one.

**The install note says so with its channel named**, rather than claiming a bare "both
tested":

```
→ install: eslint, @kekkai/blueprint, … — eslint unpinned, resolving to the newest
  supported major (9 and 10 are both admitted by every carrier's peer range, and
  @kekkai/blueprint's CI runs its own suite on each)
```

The peer-range half leads because it is the half you can check without leaving your own
`node_modules`, and because it answers what that line is for: whether the install about
to run resolves at all. The CI half names CI because this package's published
`package.json` carries `devDependencies` with eslint 9 — and two earlier runs are on
record opening that file. "Both tested" sitting beside a visible `^9.39.2`, with nothing
bridging them, reads as the tool contradicting itself rather than as two true things.

What is deliberately not covered is whether *this* repo lints cleanly on the new major.
That is a different question from whether the config blueprint *emits* still loads there
and still holds its rules, and only the second one is a promise to you.
