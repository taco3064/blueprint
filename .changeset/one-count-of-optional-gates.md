---
"@kekkai/blueprint": patch
---

**Two commands counted the optional gates and got different answers.** `blueprint rules` listed
eighteen; `inspect` and `doctor` printed `N/17 optional gates`. Same concept, two numbers, and
neither output said which gate the difference was — so a field agent reconciled it by inference and
picked the wrong one (`fixtureImports`, whose note about folding into the structural bans made it the
plausible candidate).

It is `explicitAny` on a project without TypeScript. `inspect` and `doctor` leave out gates the stack
cannot open — *a gate you cannot open is not a gate* — and `rules` mirrored only half of that rule,
the React one that silences `deepWatch`. One function now answers "can this stack open this gate",
and both read it.

`rules` keeps all eighteen rows, because a catalog that hides a gate makes it undiscoverable: the
unavailable ones say so with the reason, in the text output and as `unavailable` in `--json`. And the
row count states its own relationship to the other number rather than leaving it to subtraction —
"18 listed — 1 of them unavailable on this stack (…), which `inspect` and `doctor` leave out of their
optional-gate count".

One wording went with it. A declared-but-silenced gate read `· declared, never emits here`, which
said that it does not fire without saying why; it now reads `· declared, unavailable here` beside the
reason. The distinction that mattering — declared means a line in your config does nothing, undeclared
means adding one would — is kept, and the arm of the old ternary that no longer had a way to be
reached is gone rather than tested.
