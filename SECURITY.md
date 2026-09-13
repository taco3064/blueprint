# Security Policy

## Reporting a vulnerability

**Open an issue, in the open.**

**→ https://github.com/taco3064/blueprint/issues/new**

Private reporting is deliberately switched off here. Blueprint is a
development-time tool rather than a hosted service, and this repository keeps its
triage record public so every adopter can see a warning and its resolution. Do not
include credentials, private source, or other sensitive material in a report.

Prefix the title with `security:`. The issue stream also receives automated field
reports, so that prefix makes a security report immediately visible.

The most useful report includes:

- the command and flags you ran, plus the relevant Blueprint config;
- what Blueprint did compared with what its plan said it would do;
- the version (`npx @kekkai/blueprint --version`) and installation method; and
- a minimal reproduction that contains no confidential material.

Expect an acknowledgement within **7 days**. A confirmed report is fixed in the
next release and published as a GitHub Security Advisory against affected versions.

## Supported versions

Only the **latest published version** receives fixes. Nothing is backported.
Upgrading may involve a Blueprint config migration or an explicit architecture
decision, so follow the release notes for the target version rather than treating
every upgrade as only a dependency bump.

## Security boundary

Blueprint is a development-time package. It has its own runtime dependencies, but
it does not add a runtime footprint to the application it governs. Blueprint does
not implement telemetry, update checks, or its own network client.

Blueprint can still cross important local boundaries:

- `init` can create, merge, regenerate, or remove declared project files;
- guarded topology transformations run local, read-only Git preflight commands;
- `doctor` can invoke the project-local ESLint entrypoint to verify live wiring;
- dependency installation delegates to the detected package manager, whose network
  and registry behavior is governed by that tool and the adopter's configuration;
  and
- eligible authoring or transformation flows may launch an explicitly selected
  Agent CLI, which then operates under that tool's permissions and security model.

These delegated processes are not Blueprint network clients. Their commands and
planned repository effects must still be represented accurately by Blueprint.

### In scope

- A command writes, edits, or deletes a path it did not declare, including an
  effect missing from `--dry-run` or an effect outside the intended project root.
- The printed plan and the applied result diverge.
- A Blueprint-owned output, merge-managed section, or supported legacy-config
  migration crosses its declared ownership boundary or loses adopter-owned content.
- An emitted ESLint config silently fails to enforce a gate requested by the config.
- Blueprint launches an Agent without the explicit Agent selection required for
  that workflow, executes a different Agent command from the one declared, or
  passes credentials or repository content itself.
- A package-manager install, Git preflight, or project-local ESLint check runs
  outside its documented workflow boundary or executes a different command from
  the one Blueprint declared.
- A published artifact does not match this repository, fails provenance
  verification, or contains files outside the declared package file set.

### Out of scope

- Vulnerabilities in the Agent CLI, package manager, registry, Git executable, or
  other delegated tool. Report those to the owning project unless Blueprint invoked
  the tool outside its declared contract.
- Vulnerabilities in an adopter's application that Blueprint's architecture rules
  do not detect. Blueprint is not a security scanner.
- Disagreements about what an architecture rule should flag. Those remain welcome
  as ordinary issues without the `security:` prefix.

## Verifying what you installed

Every release is published from GitHub Actions with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements), so its
build origin is publicly verifiable:

```bash
npm audit signatures
```

A mismatch is reportable through the process above. Product behavior and upgrade
boundaries are documented at <https://taco3064.github.io/blueprint/> and in the
[changelog](./CHANGELOG.md).
