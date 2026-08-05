---
"@kekkai/blueprint": patch
---

**Two artifacts generated from one config disagreed about who enforces `cycles`.** The
handbook and `blueprint rules` both say `blueprint inspect` holds it — there is no ESLint
line, because `import/no-cycle` re-walks the whole graph per file and was measured at 92s
on 850 files. The emitted contract listed `cycles` among its hard gates under "machine-
enforced by the generated eslint config". A field agent caught the contradiction, and
named the cost precisely: `CLAUDE.md` is the file an agent reads every session, so anyone
reading only it would believe a green `npm run lint` covers cycles. It does not — a latent
false green.

The mistake was inherited from the flattened list the contract filtered on:
`LINT_GATED_RULE_IDS` answers "gated at all?", not "gated by what?". `enforcedBy()` has
existed for the finer answer since the handbook hit the same bug, and the contract now
uses it: lint-held gates sit under the lint sentence, and `cycles` is named as held by
`npx blueprint inspect --baseline` instead, so a green lint says nothing about it.

**`init --preset` says what `codeStyle` will demand.** At error tier it pins indent (2),
quotes (single), semicolons (required) and line width (90) across ~68 rules. How to land
that — nearly all auto-fixable, run `--fix` once as its own commit — was already written,
in the rule catalog that ships inside the authoring playbook. Which the preset path never
writes: a fresh scaffold reaches `init` and stops. So the guidance existed only on the
path that did not need it.

It matters most where a repo already has a style. A Vite starter is written without
semicolons and the preset asks for them — invisible today, because root files sit outside
the layer globs, and an error the day the first file moves into a layer. `init` now says
so on the scaffold path, including how to opt out (`codeStyle: 'off'` if you already have
a formatter you trust).
