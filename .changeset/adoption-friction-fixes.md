---
'@kekkai/blueprint': minor
---

Five friction fixes from running the AI-assisted adoption on four real repos
(two mature codebases, two fresh vite scaffolds):

- **The authoring flow now installs `@kekkai/blueprint`** — the config the
  agent writes imports it, so the playbook used to fall over at the first
  `npx blueprint inspect` on a repo that never installed the package.
  `--no-install` downgrades to an instruct with the exact command, and the
  playbook opens with the prerequisite either way.
- **The playbook reads existing intent documents first** — an architecture
  config or doc already in the repo (structure-lint, dependency-cruiser,
  `docs/architecture*`, agent-contract sections, ADRs) is intent evidence
  senior to the import matrix; it also carries what the matrix cannot see:
  zero-file layer positions, selfOnly-style constraints, ownership rules.
- **Greenfield template cleanup is spelled out** — when fresh scaffold code
  violates the preset out of the box (vite's vue template imports
  `../assets/*` from a component), init now lists the exact findings and the
  fix path instead of letting the first lint run read as a broken install.
- **`survey` reports unresolved alias-like specifiers** — `~x/…`-style
  imports that match no detected alias and no dependency are usually an
  undeclared alias; the report now names each prefix with its count instead
  of silently dropping it from the matrix.
- **The tsconfig alias instruct notes that `baseUrl` is not needed** — modern
  TypeScript resolves `paths` without it, and it is deprecated in 7.0.
