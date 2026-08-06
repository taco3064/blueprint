---
"@kekkai/blueprint": patch
---

**The playbook's banner names the same cleanup targets as every other site that asks for
cleanup.** Extracting that passage covered the three sites that listed targets and left the
header at "delete this file and `.claude/commands/blueprint-author.md` — doctor flags BOTH
as leftovers": the shortest version, the first one read, and the one whose "both" reads as
confirmation that two files are the whole list. An agent noticed the difference against the
checklist and the acceptance gate, and noticed too that nothing downstream would catch it —
doctor's leftover check matches file families and never looks at a directory. The banner
now renders the shared passage, so the directories are in the opening line as well.

**The line before the install says what stopping it leaves behind.** The step announces
itself and invites you to kill it when the registry is unreachable, and four runs did
exactly that — then treated the result as damage: one hand-wrote the manifest entries from
blueprint's own `package.json`, one filed the repo as left unverifiable. The failure path
already explains the half-done tree, but a killed process never reaches it, so the
pre-install line now carries both computed facts: the install is last in the plan, so every
file above it is already on disk, and it is the only step that records these packages in
`package.json` — until it runs, a failure naming one of them is that gap and not a broken
adoption.
