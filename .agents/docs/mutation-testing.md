# Mutation result adjudication

**Trigger:** automatic PR mutation CI reports an unacceptable mutant, or an existing equivalent-mutant directive needs review.

Changed-code mutation planning, lineage checks, sharding, execution, aggregation, logs, and durable artifacts belong to PR CI. Delivery and acceptance Agents do not launch Stryker. Read the aggregate summary first, then the referenced shard report and log when the failure is not already explained.

The aggregate is authoritative only for the exact base, merge-base or reviewed checkpoint, head SHA, changed production ranges, and shard inventory it records. Missing shards, range gaps or overlap, lineage uncertainty that did not fall back to the full PR scope, and evidence for an older head make the gate untrustworthy.

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
