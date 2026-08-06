---
"@kekkai/blueprint": patch
---

**The playbook no longer asserts what your tsconfig contains — it sends you to read it.**
The previous release's build guidance opened with a universal: "A Vite + TS starter keeps
`vite.config.ts` inside a tsconfig project, so `tsc -b` type-checks the vite edit too". Many
templates do (a `tsconfig.node.json` reached through `references`); many keep a single root
config at `include: ["src"]`, and there `tsc -b` never reads the file you just edited and
exits 0 whatever is in it. A field agent proved that empirically — a type error injected into
`vite.config.ts` passed, the same error in `src/` failed — and pointed out the real cost: an
agent trusting the sentence reports a verified vite edit that was never read. A hedge did
follow two clauses later, and a second agent on the same run found it; but a leading sentence
that states the RESULT of a per-repo check is the kind of thing a reader stops checking. The
assertion is now the check, both answers say where they lead, and the step ends by forbidding
the over-claim outright.

**The one artifact cell that had nothing to decide it now decides itself.** Naming all four
combinations of ignore-rules × version-control told the reader where they were, and still
left "no ignore rules AND no VCS" a coin flip — three consecutive field runs called it one.
There, "leave them to the repo's own ignore rules" names rules that do not exist, for an owner
with no `git status` to see them in. That cell now says to remove what the verification step
created and report it: the same reason this path prefers `tsc -b`, one step later. The other
three cells keep the leave-them stance, because something other than the report is tracking
the file.

**`init` says the ESLint it installs is unpinned, and which majors are tested.** `eslint` goes
in without a range, so npm resolves the newest supported major — newer than this package's own
devDependency. An adopting agent watched ESLint 10 arrive from a tool developed on 9 and could
only report "worked today", because the support range was a decision in the source that
reached no output. The install line now carries it.

**The re-adoption reproduce list is a rule instead of an incomplete list.** It enumerated four
clause shapes the dependency matrix cannot see, and no config FIELDS — so a re-adopting agent
reproduced `naming`, `principles` and `lintOverrides` only because it had read the config it
was replacing. A blind one following the schema sketch drops them and nothing goes red: the
agent contract just comes back shorter and an emitted override quietly stops being emitted.
The clause now states the rule — any field in the prior config the sketch does not show — with
`sourceRoot` called out by name, because dropping that one points every layer glob at nothing.
A new test restates `defineBlueprint`'s own field allow-lists, so a field added to the schema
and forgotten in the playbook turns red.
