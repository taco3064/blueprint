---
"@kekkai/blueprint": patch
---

**Two of the three places that instruct cleanup named fewer things than the third.** The early-exit
checklist listed the two authoring files *and* the two directories init created to hold them, with
the measured `hadClaudeDir` deciding whether `.claude/` itself is one of them. The Method's finish
step and the acceptance gate said "the two authoring files" — so an agent on the Method path, which
is the path a re-adoption follows, was told to delete two files and nothing about two directories it
had just watched init create. It worked out the `rmdir` itself and reported having to.

The decisive fact was already measured; it just was not stated where that agent was reading. The
targets are now one passage rendered at three call sites, which is the shape this repo already uses
for the `--print-config` caveats after those drifted into four paraphrases. A rule with a branch in
it, written out three times, is a rule whose branch goes missing from two of them.
