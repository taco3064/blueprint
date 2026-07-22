---
"@kekkai/blueprint": patch
---

Field issue #1 (first automated harness run): init's alias notes say the
edit's shape in place — "import alias added — existing content preserved" —
instead of a bare "write" that reads as a rewrite; a fresh scaffold with no
lint script gets one ("lint": "eslint <root>") so local lint matches the CI
gate, and an existing project gets told; the playbook states the runway
stance — a preset's declared-but-empty layers (and a not-yet-used alias) are
declared intent, not a manufactured net, so keep them unless the project
will never grow into them; the adoption guide notes which acceptance clauses
resolve vacuously (no tests, zero debt) and that this is correct.
