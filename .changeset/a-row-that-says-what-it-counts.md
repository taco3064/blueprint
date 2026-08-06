---
"@kekkai/blueprint": patch
---

**`impact`'s foreign block says what those rows ARE, not what they are not.** It called
them "echoes of YOUR OWN config" and explained a mirrored row as "the same spot seen
through your rule's name" — a mechanism that cannot happen: the run configures the emitted
rules and nothing else, so a house rule is not defined and cannot fire. What actually
produces the row is a name your code carries — an `eslint-disable` or inline config comment
— which ESLint reports AT THAT COMMENT as a rule it cannot resolve. An adopter read the
count as violations of its own rule, concluded `impact` had loaded its config and ignored an
inline disable with a reason, and filed the two claims as self-contradictory. The heading
now says the count counts mentions, that it is not a verdict on the code beneath one, and
that it is the ROWS that leave the report after the merge — the rule itself keeps judging
that code, disable comments honored.

**The isolation caveat stops describing a case that lands in the other block.**
`unused-disable-directive` said "one pointing at your own config's rules vanishes after the
merge" — a disable naming a rule this run cannot resolve is reported under that rule's id,
so it was never in this block. It now describes what does land here: a disable your real
config's rule set turns ON.

**A carrier that fails to load says what the loader said.** "impact needs
`eslint-plugin-import-x` … could not load it — is it installed?" is the same sentence
whether the package is absent or present with an incomplete tree of its own, and the caught
error was the only thing that told them apart. A run whose plugin was installed and missing
a transitive read this as "add the plugin", added it again, and reached `unrs-resolver`
through three more lint runs and three `package.json` files. The message now quotes the
loader verbatim and says what a different package name in it means: a full install of the
project fills that gap, adding this one again does not.
