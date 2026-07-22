---
"@kekkai/blueprint": minor
---

Field issue #4 (489-file brownfield run, structure-lint retired per the
playbook): unknown CLI flags now fail loud instead of being silently ignored
— `inspect --verbose` read as a broken no-op to an agent; init re-includes
its gitignored artifacts by appending `!` negations to .gitignore itself
(with the parent-directory caveat stated in the note) instead of handing the
fix back; the rule catalog now states what two agents had to eval the bundle
to learn — `owns` covers named-import granularity (a house "only composables
may inject" rule maps to it), `no-restricted-syntax` is emitted only when a
selfOnly importer exists, and `additionalAliases` join every structural ban;
the playbook's retirement clause says to DELETE the retired tool's config
and that source-comment pointers may outlive the sweep under no-source-edits;
impact's echoes block leads with "NOT blueprint findings, NEVER counted".
