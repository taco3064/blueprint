# Mutation result adjudication

**Trigger:** automatic PR mutation CI reports an unacceptable mutant, or an existing equivalent-mutant directive needs review.

Changed-code mutation planning, base and scope selection, budgeting, sharding, execution, retry, aggregation, logs, and durable artifacts belong to PR CI. Delivery and acceptance Agents do not launch or orchestrate Stryker. Consume the required exact-head mutation result; inspect its diagnostic artifact only when a reported finding needs interpretation or concrete contradictory evidence makes the result untrustworthy.

## Status meanings

- `Killed`: a test rejected the mutation.
- `Ignored`: acceptable only when a mutator-specific source directive proves the replacement is observationally equivalent.
- `Survived`: behavior changed without a rejecting assertion; strengthen the smallest relevant test.
- `NoCoverage`: no test reached the mutant; add observable coverage.
- `Timeout`: the result is unresolved, not a pass; diagnose the named shard or test.
- Compile, runtime, runner, missing-report, and unknown errors are unresolved failures, never mutation success.

If a mutation changes observable behavior, repair the narrowest test and run focused regression checks before pushing. CI reruns the authoritative scope. Do not change product behavior merely to improve a mutation result.

If a mutant is truly equivalent, record the proof at the source site:

```ts
// Stryker disable next-line EqualityOperator: both branches return the same public value
```

Name the exact mutator, never `all`. `StringLiteral` remains excluded repository-wide for the measured boundary in `stryker.config.json`; discrete literal contracts are asserted directly.
