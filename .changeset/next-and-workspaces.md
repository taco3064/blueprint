---
'@kekkai/blueprint': minor
---

Two terrain fixes from the Next.js / monorepo field round, plus a
field-tested compatibility page on the docs site:

- **Next.js projects always take the authoring flow.** The react preset does
  not fit Next — it scaffolds `src/pages/` (a routing convention there) and
  does not declare the App Router's `app/` tree — so `init` now routes any
  project with a `next` dependency to the authoring flow regardless of file
  count. The playbook opens with the fitting shape (`app` → `components` →
  `hooks` → `lib`); `--preset` still works but carries an explicit warning.
- **The package manager is detected from the workspace root.** In a pnpm /
  turbo monorepo the lockfile lives at the workspace root, not in the package
  being initialized — detection now walks parent directories for a lockfile
  or `pnpm-workspace.yaml`, so the authoring flow's auto-install generates
  `pnpm add -D` instead of the wrong `npm install -D`.
- **Docs: Field-Tested Setups** — a bilingual page recording every setup the
  releases are validated against (two production apps, four fresh scaffolds,
  the turbo + pnpm per-package model) with outcomes and caveats, plus the
  not-yet-tested list.
