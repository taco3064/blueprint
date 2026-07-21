---
'@kekkai/blueprint': minor
---

New `blueprint impact` command — the rule-impact dry-run. It compiles the authored config with `emitLint`, runs the project's own ESLint over the layer files with only that config, and reports what wiring would flag today: hits per rule, heaviest files named, `parse-error` surfaced instead of swallowed. Informational, never a gate (exit 0 whatever the count). The authoring playbook now points to it in the wire-the-lint step, so rule conflicts get decided on numbers instead of reverse-engineering the emitted config by hand.
