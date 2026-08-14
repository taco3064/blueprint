---
"@kekkai/blueprint": major
---

**`blueprint init` on a fresh tree now requires `--structure`, and exits 1 without it.** An
invocation that scaffolded a flat config yesterday refuses today — the only breaking change
in this release an adopter reaches without editing or scripting anything.

```
# before
blueprint init                       →  flat config, exit 0

# after
blueprint init                       →  exit 1, naming the option and both commands
blueprint init --structure flat      →  exactly what yesterday's run wrote
blueprint init --structure modular   →  feature modules at the source root
```

**It refuses rather than defaulting because the config migration is free and the file
migration is not.** Switching later moves every file under `src/`. The refusal follows the
precedent an undetectable framework already sets — exit 1, name the flag, print the command —
and it carries its own criterion, so an adopting agent does not go hunting for a detection
fix: *"2 source files, below the brownfield threshold (10) — there is nothing here to measure,
so this is your call, not a detection failure."*

- **"Fresh" is the threshold that already exists**, not zero files. A Vite starter ships
  `src/main.tsx` and `src/App.tsx`; defining greenfield as empty would let every template slip
  past the question. `BROWNFIELD_MIN_FILES` (10) draws the line, the same number the fork note
  has always printed.
- **A brownfield repo is never asked.** It has a layout to read, so `init` writes the authoring
  playbook — and `--preset` above the threshold scaffolds flat, unasked, because *"there is
  nothing here to measure"* is false on a repo that size.
- **`--preset` is not an exemption below it.** That flag skips the authoring flow, not the
  structure question.
- **A re-run over an existing `blueprint.config.mjs` does not re-ask.** The config's own
  `architecture.modules` is the answer.
- **`--dry-run` refuses before printing any of the plan.** A plan above the refusal reads as a
  run that was going to work.

**A detected Next.js route tree is not asked, and the run says why it was not.** `nextPreset`
builds one shape and takes no `structure`, so there is nothing to decide — and a refusal is not
"make them decide" when there is no choice. Every other fresh scaffold is asked and this one is
not, so the run states that, in `nextPreset`'s own words rather than a second copy of them. A
Next repo whose route tree could *not* be placed resolves the react preset instead, and that one
is asked like any other.

**`--structure` on a brownfield repo now says it reached nothing.** That path returns through
the authoring playbook before the flag is read, so an adopter who stated a preference and saw no
acknowledgement of it read the run as having taken it. The run now names the document that
decides instead, and prints the invocation that would honour the flag
(`init --preset --structure modular`). `--framework` is dropped on the same path and is left
alone here, so the precedent stays visible rather than being quietly changed underneath.

`init --help` stops promising a default it no longer has.
