# Security Policy

## Reporting a vulnerability

**Open an issue, in the open.**

**→ https://github.com/taco3064/blueprint/issues/new**

Private reporting is deliberately switched off here — that is a decision, not an
oversight, so please do not go looking for a form that is not there. The reasoning:
blueprint is a development-time tool with no network code and no runtime footprint
in your shipped app, so there is no live service that an embargo would protect. The
exposure between a report and its fix is a devDependency you can pin, drop, or stop
running — which is a fair trade for every user seeing the warning the same day the
maintainer does. This repository's entire triage record is public for the same
reason.

Prefix the title with `security:` — the issue stream is mostly machine-filed
`field-run` reports, and that prefix is what lifts yours out of it.

What helps most, in rough order:

- the command you ran, with its flags, and the blueprint config it ran against
- what it did versus what it printed it would do — for a tool whose safety story
  is "every effect is declared before it lands", a gap between those two *is*
  the vulnerability
- the version (`npx @kekkai/blueprint --version`) and how it was installed

Expect an acknowledgement within **7 days**. A confirmed report is fixed in the
next release and published as a GitHub Security Advisory against the affected
versions, so `npm audit` reaches the people who never read the issue.

## Supported versions

Only the **latest published version** receives fixes. Nothing is backported —
this is a development-time tool with no runtime footprint in your shipped app,
so upgrading is a devDependency bump, not a migration.

## What counts as a vulnerability here

Blueprint has no network code, no credentials, and zero runtime dependencies, so
the usual web threat model does not apply. What it *does* have is write access to
your repo and one opt-in path that starts a process. Those are the surfaces:

**In scope**

- A command writing, editing, or deleting a path it never declared — including
  anything `--dry-run` did not print, and anything outside the project root
- Any divergence between the printed plan and what `apply` actually does
- The emitted ESLint config silently not enforcing a gate the config asks for —
  a gate that reports green while enforcing nothing is a false assurance, and
  the whole point of the tool is that the assurance is true
- `init --agent` executing anything other than the exact command it printed, or
  passing any credential or repo content to it
- A published artifact that does not match this repository — failed provenance
  verification, or files in the tarball that are not in `files`

**Out of scope**

- The agent CLI you launch with `--agent`: blueprint prints a command and hands
  over; what your own `claude` / `codex` install then does is that project's
  security model, under your own permission prompts
- Vulnerabilities in *your* repository that blueprint's rules did not catch — the
  gates are architecture rules, not a security scanner
- Disagreements about what a rule should flag. Everything here lands in the same
  issue tracker, so the difference is only the `security:` prefix — leave it off
  and it is an ordinary report, which is just as welcome

## Verifying what you installed

Every release is published from GitHub Actions with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements), so the
build origin is publicly verifiable rather than taken on trust:

```bash
npm audit signatures
```

A mismatch is itself reportable — see above.

The behavioral guarantees this policy is scoped around are spelled out, with the
reasoning, at
[Security & Trust](https://taco3064.github.io/blueprint/guide/security).
