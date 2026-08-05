---
"@kekkai/blueprint": patch
---

**Four things the output stated without stating why.** Found by the field run on the
previous release candidate — six more adoptions, all green, none blocked, none misled.

**`init` names the `.gitignore` rule that hid an artifact, not just the artifact.** It
appends a `!` negation so the handbook the contract links to stays tracked. A field
agent then ran `git check-ignore` on the file, got "not ignored", and filed the whole
thing as dead config. It was not: `docs/*` hid the handbook, and the negation is what
un-hid it. **A check run after a fix cannot tell "never needed" from "currently
working"** — so the note now names the pattern, which the fix has not touched:

```
.gitignore (re-included docs/architecture-handbook.md — hidden by `docs/*` — via !; …)
```

**The agent contract says how far its hard gates reach.** Every CLI surface marks a net
over an empty repo as vacuous — `impact` says "proves nothing until code lands",
`inspect` calls a missing layer runway, `doctor` says "clean, but vacuous". The emitted
contract said `Hard gates (machine-enforced)` and stopped, and two agents flagged it
independently. One put the argument better than this changelog can: that contract is the
one artifact a future agent reads with no CLI output beside it, and it was the only one
without the caveat. It now names the reach — enforced on the files the layer globs match,
so a layer holding no code is runway, not protection — stated as reach rather than as a
count, so it does not go stale the day code lands.

**Two clauses in the authoring playbook, both second-order effects of the previous
release.**

The check-only rule for blueprint's own prior output has an edge it did not cover: some
clauses cannot be derived from the import matrix at all — ownership of a named import,
the shape of a selfOnly narrowing, the position of a layer holding no files, a permitted
importer with zero edges today. For those the prior output is the only evidence there
is, so check-only means dropping them, and a faithful re-adoption hands back a config
*looser* than the one it replaced. Verify each against what the matrix can see,
reproduce it when that checks out, and report which clauses were reproduced rather than
derived — regressing a gate the owner already committed is the worse error.

And the merge guidance on carrying an emitted entry's `ignores` ran one way only:
skipping them makes your combined entry govern test files it should not. The mirror
case is just as real — carrying blueprint's test exemption onto a house rule that had
none stops that rule at test files it used to govern. One entry carries one `ignores`,
so a merge has to pick; the playbook now says to decide deliberately, say which way you
went, and check the layers you did *not* merge, because that is where the asymmetry
lands.
