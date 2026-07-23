# Component Shape — 7 Orthogonal Axes

> **In blueprint**: these are the presets' [`componentShape`](/api/interfaces/AxisDef)
> axes. The named triage rules (`max-params`, `max-statements`, `max-lines`) land in the
> [generated lint config](/guide/reference#blueprint-rules-—-which-ids-actually-gate) as
> entry points; the verdicts compile into your handbook and agent contract.

How a component / composable should be shaped, in seven axes. **A set, not a pipeline**:
each axis is an independent yes/no design decision — never infer that one axis holds
because another does. Numbering is identity, not order, and trivial changes need not
force the full pass.

Almost everything here is ◐/○ — component shape is design judgment, which is exactly
belief #6. Lint metrics are entry points; the verdict stays with review.

### 1. Ownership Inversion — the unit that needs derived state owns the derivation

Do not precompute in the parent and drill the result down; the child imports the hook and
derives it itself. Field-tested: a 17-prop component down to 7.

### 2. IO Shrinkage — narrow the inputs, shrink the outputs

Three moves: split a multi-concern unit; collapse parallel raw states carrying an
invariant into one modeled state; merge symmetric twins into one object of the same
shape. Count and size are weak signals — *whether the state is modeled* is the review
call. Triage: `max-params`.

### 3. SRP Decomposition — split on responsibility boundaries, not size

Naming test: if you cannot name it without "and", it wants splitting. Dissolving code
into an existing home is also a split. Exception: writable state that must stay in sync —
force-splitting it manufactures sync bugs. Triage: `max-statements`.

### 4. Orchestration Shell — a page only orchestrates

Route/id resolution, the loading shell, shared sources, cross-child lifecycle — never
deriving values on behalf of each child. Field-tested: a 6666-line detail page down
to 552. Triage: `max-lines` on pages.

### 5. Scoped Writable State — the lowest common owner of writers and readers

Hoist only what is genuinely shared across a boundary; state that must survive a route
change goes to the URL or a store. "Might be shared later" is YAGNI — hoist when the
sharing arrives.

### 6. Lifecycle Internalization — if lifecycle is part of the responsibility, build it in

The caller receives a unit that is already running and cleans itself up — not a kit of
handlers to wire into `onMounted` / `useEffect`. Field-tested: 19 exports down to a
one-line call.

### 7. Pure Helpers ≠ Composables — keep pure functions out of reactive units

One exported function does not demand one file: responsibility splits at the function
level; the file splits only when `max-lines` approaches. Expose the *decision* a unit
makes, not its raw ingredients.

---

**Lint vs review, across all seven axes**: a unit can be small, low-complexity, low
fan-out — all green — and still be a raw-state dump, or store its derivation in a mutable
ref. Metrics cannot see any of that. A lint warning is where review *starts*.
