---
name: audit-docs
description: Audit whether Blueprint's published documentation and generated examples match the current product. Use for documentation-alignment reviews. Do not implement findings unless the invocation separately authorizes implementation.
---

# Audit product and documentation alignment

Read and follow [the shared autonomous delivery policy](../../docs/autonomous-delivery.md).
This skill owns evidence gathering and the audit verdict, not implementation.

## Establish the evidence base

1. Fetch the remote and audit current `origin/main`; do not treat a stale local build as product evidence.
2. Read the repository guidance that applies to every inspected surface.
3. Inventory the relevant English and Traditional Chinese guides, CLI help and argument parsing, package exports and TypeDoc output, generated contracts and configuration examples, runtime text, and machine-readable output.
4. Prefer observed runtime or generated output over conclusions inferred from source names.

## Compare the product surfaces

1. Compare every relevant CLI command and flag across help text, parsers, and reference pages.
2. Compare documented configuration fields and behavior with their owning types and runtime consumers.
3. Build the documentation. Treat every TypeDoc warning as a finding even when the command exits successfully.
4. Exercise generated examples with fixtures matching the stack the prose claims to demonstrate. Do not reject a JavaScript example merely because a TypeScript fixture emits additional configuration.
5. Compare English and Traditional Chinese coverage by meaning, not only by matching headings or keyword counts.
6. Use positive and negative controls whenever a check could pass without exercising the claimed behavior.

## Report

For each inventoried surface, report exactly one status:

- `ALIGNED`: behavior and documentation agree, with concrete evidence.
- `MISMATCHED`: a reachable difference changes what an adopter understands or does, with expected and actual evidence.
- `NOT_PROVEN`: the available evidence cannot establish alignment, with the missing check named.

Record the command, file, public symbol, or generated artifact supporting each status. Distinguish observed facts from inference. Stop after reporting findings unless the invocation separately authorizes implementation.
