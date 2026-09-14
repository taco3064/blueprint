# Private field validation and release handoff

**Trigger:** running live Agent field validation, triaging a field finding, or preparing a release.

## Field boundary

Live Field validation is owner-operated and private. It is not a GitHub Actions gate, does not write a commit status, and is not queried by the release workflow.

Use Field before release preparation, while product changes are still allowed:

```text
product candidate
→ owner-run Field / live Agent validation
→ repair product findings as needed
→ owner accepts the release candidate
→ Changesets release preparation
```

Affected replay and full-matrix choices remain owner judgment. GitHub Actions does not decide whether Field is complete and does not require a Field report.

After the owner accepts Field, product behavior is frozen for that release. If product/source behavior changes afterwards, whether to repeat Field is an owner decision rather than an automated release condition.

## Release preparation

After pre-release validation is complete:

1. Review the pending `.changeset/*.md` entries.
2. Run `npx changeset version`.
3. Review the generated version and `CHANGELOG.md`; hoist release framing when needed.
4. Commit and merge the release metadata.
5. Create the release tag.

The release workflow validates the Changesets release SHA mechanically. It finds the ancestor commit that changed `package.json` from the previous version to the tagged version, then requires that commit to include `package.json`, `package-lock.json`, `CHANGELOG.md`, and consumed `.changeset/*.md` entries.

The tagged tree may be newer than that Changesets SHA only for non-package release plumbing or maintainer guidance. Product/package inputs must not change after the Changesets SHA. This permits release-workflow repairs without manufacturing another Field cycle while still preventing unversioned product changes from slipping into the published package.

The tag workflow then installs dependencies, builds, runs `dist:verify`, checks tag/version/changelog/consumed-changeset state, publishes with npm provenance, and creates the GitHub Release from the matching changelog section.

There is no `blueprint/field-convergence` requirement in release automation.