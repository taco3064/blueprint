---
"@kekkai/blueprint": patch
---

**A finding now names the rule that carries it, and the `--agent` flag says which path launches anything.** Two field observations, both cases of a correct state reading as a broken one.

One violation went by three names. `inspect` reported `[deep-import]`, `impact` and the lint run called it `no-restricted-imports`, and an adopter verifying the merge searched the resolved config for `blueprint/deep-import` and found nothing — because that ban, like `flow-violation` and `package-ownership`, folds into the single `no-restricted-imports` entry rather than standing alone. Inspect's migration steps now carry both halves: each names its finding and the ESLint rule that enforces it, and the findings no lint run will ever show — `cycle`, `undeclared-folder`, `no-entry` — say so instead of leaving the reader to wonder where they went. `relative-escape` is called out as the one structural ban that *is* a standalone rule, since a `../` escape cannot be written as a literal pattern.

The playbook's `--print-config` guidance gains this as its fourth "know this before reading the output": finding names are not rule ids. It sits beside the three added last release — prefixed keys, rules absent because their layer holds no files, and selfOnly resolving on the importer layer.

Separately, the README's security bullet was imprecise about `--agent` and two field runs stopped to check. It presented the flag as the one explicit opt-in that runs an agent, without saying that this is true only on the authoring path; on the preset path (`init --preset --agent claude`) nothing is launched and the flag only narrows which contract file is written. Both meanings are stated now, with `init --help` and `--dry-run` named as the authoritative check — which is what both agents reached for.
