---
"@kekkai/blueprint": minor
---

**The selectors the merge step tells you to copy did not survive being copied.** `blueprint rules`
is the supported source for folding blueprint's `no-restricted-syntax` entry into a house one, and
its selectors separate path segments with a `/` escape — a raw `/` would end esquery's regex
early. JavaScript resolves that same escape when it parses a string literal, so pasting the rendered
value into `'…'` turns the selector into `/^@/contexts//`: a regex that ends at the bare `/`. No
parse error, lint still green, and the ban quietly stops matching anything.

A field agent found it by following the instruction with the most natural tool for the job (`jq -r`),
then verified both halves — that the rendered value has already lost the escape by the time it
reaches a JS literal, and that only the doubled form survives. What made it worth reporting even
though the agent caught it: doctor's survival check does go red, and its message offers "a selector
respelled to an equivalent" as a reason a red may be a false alarm. Here the respelling is not
equivalent, so the red is answerable with the wrong answer.

`rules --json` now carries `jsLiteral` beside `selectors` — the same selector as JS source, quotes
included — and the text output prints that form, since that line exists to be copied. `selectors`
is unchanged for programs that build config rather than paste it, and the entry's `note` says which
of the two to take and why. The merge step names the field.
