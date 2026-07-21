# Ten Core Beliefs

> **In blueprint**: these are the presets' [`principles`](/api/interfaces/PrincipleDef) —
> `init` compiles them verbatim into your repo's handbook and agent contract. All ten
> land in the contract, not in lint (belief #7 is why they can't): the agent holds them
> on every change. Mechanism: [The Operating Contract](/philosophy/).

Every rule in the handbook converges on these. Each later part is an expansion of one or
more of them.

### 1. Split by responsibility, not by size

The signal to split is *how many things this unit does*, not *how long this file is*.
Line count is a derived signal; `max-lines` is the only line-level backstop —
`max-statements` and per-function metrics are triage only.

### 2. One source of truth

Derive computed values (`computed` / `useMemo`); never store a mutable copy that can
desync. The same datum never lives in two writable places.

### 3. Keep interfaces narrow

Narrow inputs, few outputs — so illegal states cannot be expressed, and callers depend
only on what they actually need.

### 4. Knowledge lives where it is used

Derivation belongs to the child that needs it; writable state belongs to the lowest
common reader/writer; lifecycle belongs inside the unit that owns the responsibility.
Do not hoist upward by default.

### 5. Never break, fake, or clean up after backend data

Preserve the backend shape, keep deliberate guards against drift, and let missing data
render as empty or error — never a fake fallback, and never an FE hack covering for work
the backend should do.

### 6. Dead code: delete it, or mark it

An abstraction with no consumer is dead code. Sweep orphans in the same change that
orphaned them; anything deliberately retained gets `@deprecated` with a pointer.

### 7. Lint is an entry point, not a verdict

Mechanical checks (size, complexity, fan-out) only triage. Cohesion, modeling, single
source of truth, structural invariants — only review catches those. **Lint green ≠
qualified.**

### 8. Acceptance criteria are a start, not scripture

When a ticket's literal reading violates an abstraction's responsibility, fixing that is
*guarding the design*, not deviating from the ticket.

### 9. YAGNI — do not over-engineer

Trivial changes need no pattern ceremony. "Might be shared later" is not a reason to
hoist or abstract now.

### 10. Cost is the third dimension

Correct values and clean structure do not guarantee acceptable cost. Cost = work per
event × event frequency — and *frequency is not in the code*. Any logic attached to a
data source must be priced; copying an existing pattern is not an exemption.
