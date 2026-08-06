---
"@kekkai/blueprint": patch
---

**Half of one sentence was measured and the other half asserted, and the asserted half was wrong.**
The cleanup step tells an agent to delete the playbook, the command file, and "the now-empty
`.claude/commands/` directory" — and it already checks whether `.claude/` itself pre-existed, because
that one is the owner's. It never checked the child. A field agent with its own
`my-existing-command.md` beside blueprint's got the parent clause right and the child clause wrong in
the same breath, and was told to delete a directory that would still hold someone else's file.

Cost to that run was nothing — it looked before deleting, and "now-empty" reads enough like a guard
that a careful reader stops. It was reported because the tool contradicted a state it could see, and
verified: same repo, both clauses, one true and one false.

Both halves are read now. Where other commands remain, the instruction is to delete the two files and
nothing else, with the count and whose they are — and `.claude/` needs no clause at all, since a
directory whose child stays was never a candidate.
