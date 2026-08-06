---
"@kekkai/blueprint": patch
---

**The generated contract told the next agent to run `npm run lint` in a pnpm repo.** `init` printed
`blueprint init · vue · pnpm`, installed with `pnpm add`, and then wrote a contract block naming npm —
in a repo whose own `CLAUDE.md` says not to use it. A field agent lined the three up and verified that
the tool's detected fact and its generated instruction disagreed.

Two answers, because there are two mediums. The contract and the handbook are generated from the
blueprint alone and cannot see the repo — the handbook's own source says so — so they now name no
runner at all: gates "fail the project's lint run". A name a generator cannot check is worse than no
name, and the reader finds the script in `package.json` either way.

The authoring playbook is written by a runtime that *did* detect the manager, so there it is named:
`pnpm lint` on a pnpm repo, `npm run lint` on an npm one, from the same detected fact the install
command already uses.

The sweep found three generated artifacts carrying the guess, not one — `CLAUDE.md`, `AGENTS.md` and
`docs/architecture-handbook.md` — plus the playbook's two script mentions.
