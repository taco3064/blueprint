# Search discovery and publication

The public documentation URL is `https://taco3064.github.io/blueprint/`.
Product pages, package version, commands, and generated API reference come from
the latest published stable GitHub release. Publishing tools come from the
workflow's exact commit. A push to `main` can publish presentation improvements
without publishing unreleased product behavior.

## Release-preserving presentation overlay

`scripts/docs-overlay.mjs` accepts a separate clean checkout at the selected
release tag. It verifies the tag against the package version and checkout HEAD,
then checks an explicitly reviewed config fingerprint and VitePress version.
An unknown config or dependency version fails before any overlay files are
written. To support a new config, review its navigation, locale, hook, and build
compatibility; add its normalized SHA-256 fingerprint to `supportedConfigs`
with `wrap` for a legacy config or `native` for a config already using `withSeo`.
The rejection is intentional and must not be replaced by accepting arbitrary
configs or copying the candidate's complete `.vitepress` directory.

The only copied candidate files are `seo/index.ts`, `seo/seo.ts`,
`theme/version-identity.ts`, and `theme/VersionBadge.vue` under
`docs/.vitepress/`. The legacy config remains intact as `config.release.mts` and
is imported by a small `withSeo` wrapper. No candidate Markdown, navigation,
package manifest, lockfile, API source, or product configuration is copied.
Every other tracked release file is hashed before and after application.

The published `docs-provenance.json` records the release tag, release commit,
publishing-tools commit, overlay version, reviewed config fingerprint,
individual overlay file hashes, and preserved-file inventory digest. This file
travels inside the Pages artifact and remains available at the stable public
URL even after Actions logs expire.

The `Released documentation overlay proof` CI job builds the actual latest
release plus candidate overlay, checks the existing link and API contracts,
and validates that exact output with `check-doc-seo.mjs`. It saves the artifact
for inspection. Candidate documentation has its own build and SEO check. Both
jobs are required by the PR gate and main candidate gate.

The Docs workflow repeats the released build, checks that the selected release
is still latest immediately before deployment, then compares the live site
with the exact saved build artifact using `check-doc-live.mjs`. A successful
local build or PR job alone is not evidence of public deployment or indexing.
If a release changes during the run, rerun against the new latest release.

## Indexing and locale policy

English API pages and the English changelog are the indexable authorities.
The mounted `/zh-TW/api/` pages and `/zh-TW/changelog.html` are English copies
in the Traditional Chinese navigation: they declare noindex and canonicalize
to the matching English page. These copies are excluded from the sitemap and
are not advertised as translated hreflang alternates.
Only genuinely translated handwritten page pairs receive reciprocal locale
alternates. The 404 page is also non-indexable and excluded from the sitemap.

## Search Console owner handoff

Use a **URL-prefix property** for `https://taco3064.github.io/blueprint/` in
Google Search Console. A domain property would require DNS ownership of
`github.io`, which this repository does not control.

1. The owner opens Search Console with the intended Google account and adds
   that exact URL-prefix property.
2. Choose the HTML tag verification method. Copy only the `content` value from
   Google's `google-site-verification` meta tag into the repository Actions
   variable `DOCS_GOOGLE_SITE_VERIFICATION`. This is a public verification
   value, not a credential. Never invent a token or commit a placeholder.
3. Run the Docs workflow and wait for deployment plus live verification. The
   variable is injected into the build as a meta tag; keep it configured for
   later releases so verification persists.
4. Confirm the deployed homepage contains that exact tag, then click Verify
   in Search Console. This owner-account step is separate from repository CI.
5. Submit `https://taco3064.github.io/blueprint/sitemap.xml` under Sitemaps.
6. Inspect the homepage, an English guide, its Traditional Chinese counterpart,
   and a generated API page. Use Test live URL to inspect fetchability and
   declared canonical, then request indexing for representative URLs.

Record the property, verification result, sitemap submission status, inspected
URLs, and observation date in the delivery evidence. Submission and request
indexing do not guarantee indexing, ranking, or a particular completion time.
No account verification or sitemap submission is claimed until observed in
Search Console. Chrome interaction requires the owner's separate handoff.

## Crawl boundaries and verification

The artifact publishes `/blueprint/robots.txt` as a discoverability aid with an
absolute sitemap URL. Google's authoritative robots location is the origin
root, `https://taco3064.github.io/robots.txt`; a project Pages deployment cannot
control it. Do not interpret the project file as an origin-wide crawl policy.
Inspect the root file for a conflicting disallow when diagnosing a live crawl
problem. A root 404 means that no root robots policy was returned, not that the
project file has become authoritative. Canonicals, locale links, sitemap
membership, and page-level `noindex` are verified in the built HTML.

For local reproduction, check out the stable release into a separate clean
folder and run:

```sh
node scripts/docs-overlay.mjs . ../blueprint-release v4.2.0
cd ../blueprint-release
npm ci
VITE_BP_DOCS_TAG=v4.2.0 npm run docs:build
npm run docs:check
node ../blueprint/scripts/check-doc-seo.mjs docs/.vitepress/dist
```

Replace the example tag with the latest published stable release. After the
corresponding deployment, run `node scripts/check-doc-live.mjs <artifact-dist>`
from the publishing-tools checkout. Preserve the exact artifact and provenance
when investigating a mismatch; rebuilding a newer commit is different evidence.
