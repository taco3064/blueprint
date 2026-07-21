# Working Discipline

> **In blueprint**: this is the presets' [`playbook`](/api/interfaces/PlaybookSection) —
> the judgment rules no tool can enforce. `init` compiles them into your repo's handbook
> and [agent contract](/guide/generated-artifacts#claude-md-agents-md-—-collaborate), so
> they sit *in context* on every change.

Four themes.

## Data integrity & backend boundary

- **Never fall back to fake data.** A `payload.field || fixture.field` fallback is a bug,
  not a safety net — it hides integrity problems. Production renders empty, error, or
  skeleton; never fabricated values.
- **Frame kept defenses as drift guards.** A deliberately retained shape-defense is
  framed "guard against BE drift", never "support payload X missing field Y". Strip one
  only when drift is out of question and tests prove zero call sites.
- **Do not volunteer FE workarounds for BE-owned problems.** When the fix belongs to the
  backend and that position is already public, offering a short-term FE hack hands the
  work straight back to the frontend.
- **Services preserve the backend locale shape.** Resolving `{ zh_cn, en }` to one string
  inside a service drops the other variant and mixes presentation into the service layer —
  resolve in the view.

## Runtime load discipline

The question after "is the data correct" is "**how fast does it arrive**" — the dimension
lint and structure cannot see. This is belief #10.

- **Price every handler attached to a data source.** Before wiring anything to WS /
  polling / scroll / input, answer: events per second, data per event, per-event cost.
  If you cannot answer, it does not merge — and copying an existing pattern is no
  exemption, because frequency is not in the code.
- **High-frequency updates write in place.** Patch the changed entry and keep container
  identity; whole-replace is for baseline rebuilds only. A prop whose identity changed
  while its value did not is the disease. Write shapes do not port across frameworks —
  React leans on immutable + memo, Vue on property-level tracking.
- **Diagnose re-renders in four steps, never by guessing.** Who renders (profiler) → what
  triggered it (render tracing) → who produced the identity (grep the assignment sites) →
  was it worth it (compare against the event payload).
- **Performance claims must be acceptance-testable.** "Fewer re-renders" is not a claim;
  "one event re-renders at most N components" is. Pin it with a render-count or
  identity-stability test.

## Dead code & abstraction

- An abstraction must gain a production consumer **in the same PR** — a unit whose only
  caller is its own test is dead code dressed as architecture work.
- Removing the last call site removes the unreachable code with it, in the same change.
- Retained-but-disabled code gets `@deprecated` pointing at a status doc — on the entity,
  not its tests.
- Moving an anti-pattern to a sibling file under an `eslint-disable` is not a fix, and
  per-line disables are not a migration.

## Refactor & collaboration

- **Safety net first, then split, then tidy the tests** — three stages, one commit each,
  non-overlapping review scopes.
- **Extract by copying from source, never by rewriting from memory** — then diff against
  git history; a passing suite alone does not prove the extraction faithful.
- **Scan every identifier before extracting** — imports, local definitions, parameters.
- **Do not pin what the refactor itself will change** in the safety net.
- **Frame architectural corrections as guarding the design** — state the principle being
  protected, show how the literal ticket reading violates it.
- **Do not reopen settled designs**; raise genuine concerns once, with reasons — not as a
  menu of alternatives.
- **"The user can work around it" does not park a bug** — judge by scope and standalone
  impact.
