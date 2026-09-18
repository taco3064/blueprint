# Blueprint evidence feed

A Cloudflare Worker that serves the Evidence section on the docs homepage. It reads
`taco3064/blueprint` Discussions through the GitHub GraphQL API as a GitHub App and returns a small
public projection. GitHub Discussions stay the only place articles are written; the docs site
fetches this feed in the browser, so a Discussion created, edited, or deleted on GitHub reaches the
homepage within the five-minute cache window without a commit or a GitHub Pages deployment.

This directory is its own package. Its tooling (`wrangler`, which needs Node 22 or later) is never a
dependency of `@kekkai/blueprint` and does not change that package's Node support. The root
`npm test` and `npm run tsc` still cover the Worker source, because it depends on nothing but
standard Web APIs.

## Endpoint

`GET /discussions` returns every repository Discussion, newest-created first:

```json
{
  "discussions": [
    {
      "number": 504,
      "title": "…",
      "preview": ["first meaningful line", "second", "third"],
      "url": "https://github.com/taco3064/blueprint/discussions/504",
      "createdAt": "2026-09-16T00:47:38Z",
      "updatedAt": "2026-09-16T00:47:38Z"
    }
  ]
}
```

`preview` is the first three body lines that contain a letter or a digit, skipping a first line
that only repeats the title. Comments, reactions, and full bodies are never fetched or returned.

What the Worker answers without calling GitHub:

- **Any other path** — `404`.
- **Any method but `GET` or `HEAD`** — `405`.
- **Any query string**, even a bare `?` — `400`. Workers Caching keys on the query string, so
  accepting one would let a caller mint cache misses at will.
- **A request header Workers Caching adds to its cache key** (`forwarded`, `x-forwarded-host`,
  the method-override headers, and the others the Worker lists) — `400`, for the same reason.
- **An `Origin` other than the two below** — `403`.

Browser access (CORS) is granted to `https://taco3064.github.io` (the published docs) and
`http://localhost:5173` (`npm run docs:dev`). A request with no `Origin`, such as `curl`, is served
without a CORS grant.

A successful feed is cached at the Cloudflare edge for five minutes
(`Cloudflare-CDN-Cache-Control: public, max-age=300`, `Vary: Origin`). Browsers get
`Cache-Control: no-cache`, so they always ask the edge again and never hold a copy past that window.
A GitHub or configuration failure returns `502` with `{"error": "Live evidence is unavailable."}`,
cached at the edge for one minute so a broken App is not retried on every request. Failure details
go only to the Worker log.

Every response carries `X-Worker-Version`, the ID of the deployed Worker version that answered it.

## Deployment

`.github/workflows/evidence-feed.yml` owns the Worker's lifecycle; nothing is deployed by hand.

- **Pull requests** that touch this directory bundle the Worker with `wrangler deploy --dry-run`,
  without deploying it.
- **Every push to `main`** that touches this directory runs `wrangler deploy`, requires the
  homepage's `EVIDENCE_FEED_URL` to be the URL it just deployed, then runs `scripts/smoke.ts`
  against that URL with the version ID wrangler reported. The check waits until the URL answers
  from that exact version, then requires `/discussions` to answer `200` from it with a Discussion
  feed and the docs-origin CORS grant. The run summary lists the Discussions served; any failed
  check fails the run. The Cloudflare secrets reach only the credential check and the deploy step.
- **A pull request labeled `deploy-evidence-feed`** deploys that pull request's exact head to
  production and verifies it the same way. Adding the label is the owner's approval to put an
  unmerged candidate live, which is how a change is proven before it merges; no other pull-request
  event deploys. To deploy a newer head, remove the label and add it again.
- **Run workflow** on `main` (or `gh workflow run evidence-feed.yml --ref main`) redeploys and
  re-verifies without a commit.

The deployed URL is recorded on the repository's `evidence-feed` environment.

## Activation

Four steps need your own GitHub and Cloudflare sign-in, once. After them, nothing about the feed
is manual. Only the App ID, the installation ID, and the Worker URL are committed; none of them is a
secret. The current values:

- **App ID** — `4988210` (`GITHUB_APP_ID` in `wrangler.jsonc`).
- **Installation ID** — `162710734` (`GITHUB_INSTALLATION_ID` in `wrangler.jsonc`).
- **Worker URL** — `https://blueprint-evidence-feed.tabacotaco.workers.dev/discussions`
  (`EVIDENCE_FEED_URL` in `docs/.vitepress/theme/evidence-feed.ts`).

### 1. GitHub App

Open the
[prefilled registration page](https://github.com/settings/apps/new?name=Blueprint+Evidence+Reader&description=Reads+taco3064%2Fblueprint+Discussions+for+the+Evidence+feed+on+the+docs+homepage.&url=https%3A%2F%2Ftaco3064.github.io%2Fblueprint%2F&public=false&webhook_active=false&request_oauth_on_install=false&discussions=read)
and select **Create GitHub App** (rename it if GitHub reports the name as taken). It is already set
to **Discussions: Read-only** (GitHub adds **Metadata: Read-only** itself), no webhook, no user
authorization, and installable **Only on this account**.

Then, on the new App:

1. Note the **App ID** on the **General** page. This is `GITHUB_APP_ID`.
2. **Generate a private key**. GitHub downloads a `.pem` file. Keep it on your machine until step 4;
   it is never pasted into an issue, pull request, chat, repository file, or GitHub secret. GitHub
   App keys do not expire — they stay valid until deleted.
3. **Install App** → your account → **Only select repositories** → `taco3064/blueprint`.
4. On the installation's settings page, the URL ends in `/settings/installations/<number>`. That
   number is `GITHUB_INSTALLATION_ID`.

The Worker asks GitHub for an installation token limited to `blueprint` with `discussions: read`,
so the token it uses cannot exceed that scope even if the App's permissions are widened later. If
the live query ever fails for lack of permission, record the exact GraphQL error from the Worker
log before changing any App permission.

### 2. Cloudflare

- A Cloudflare account on **Workers Free**, with a `workers.dev` subdomain
  (**Workers & Pages → Overview**). The Worker is served at
  `https://blueprint-evidence-feed.<subdomain>.workers.dev`.
- An API token for the deploy job: **My Profile → API Tokens → Create Token → Edit Cloudflare
  Workers**, with **Account Resources** limited to this account and **Zone Resources** set to all
  zones from this account.
- The **Account ID**, shown on **Workers & Pages → Overview**.

Stay on Workers Free. No custom domain, KV, D1, R2, or Durable Object is needed.

### 3. Repository secrets

```sh
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
```

Each command prompts for its value (or use **Settings → Secrets and variables → Actions**). Only the
deploy job reads them.

### 4. Activate before merging

The feature is activated and proven on the pull request's exact head, before it merges.

1. Commit the App ID and installation ID under `vars` in `wrangler.jsonc`, and the Worker URL
   (`https://blueprint-evidence-feed.<subdomain>.workers.dev/discussions`) as `EVIDENCE_FEED_URL`
   in `docs/.vitepress/theme/evidence-feed.ts`.
2. Add the `deploy-evidence-feed` label to the pull request. That deploys its exact head.
3. The first deployment creates the Worker without its key, so its **Verify the live feed** step
   fails with a `502` that names `GITHUB_PRIVATE_KEY`. Add the key in the Cloudflare dashboard:
   **Workers & Pages → blueprint-evidence-feed → Settings → Variables and Secrets → Add**, type
   **Secret**, name `GITHUB_PRIVATE_KEY`, value the whole `.pem` file. The key GitHub downloads
   (`BEGIN RSA PRIVATE KEY`) is accepted as is; a PKCS#8 key (`BEGIN PRIVATE KEY`) works too.
   Deployments never touch Worker secrets, so the key stays through every later deploy.
4. Re-run the failed job (**Re-run failed jobs**, or `gh run rerun <run-id> --failed`). It passes
   once the feed serves the real Discussions.
5. Prove the live feature on that head: `npm run docs:dev` (an allowed origin) renders the live
   feed on both homepages, and a test Discussion created, edited, and deleted on GitHub shows each
   change within five minutes with no commit.
6. Merge. The push to `main` redeploys the merged tree and the docs workflow publishes the homepage.
7. Delete the local `.pem`, or keep it offline.

### Rotating the key

Generate a new key on the App page, replace the `GITHUB_PRIVATE_KEY` secret's value in the Cloudflare
dashboard, then delete the old key on the App page.

## Local development

```sh
npm run dev
```

`wrangler dev` reads local values from a `.dev.vars` file in this directory (ignored by Git) —
`GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, and `GITHUB_PRIVATE_KEY`. Point the docs dev server at it:

```sh
VITE_EVIDENCE_FEED_URL=http://localhost:8787/discussions npm run docs:dev
```

## Limits

- **Requests** — Workers Free allows 100,000 requests a day, and cache hits count toward it. Past
  the limit Cloudflare answers with Error 1027 and the homepage shows its fallback link to the
  Discussions page.
- **Subrequests** — Workers Free allows 50 per request: one token exchange plus at most 49 GraphQL
  pages of 100, so up to 4,900 Discussions. Beyond that the feed returns its `502` instead of a
  partial list.
- **CPU** — Workers Free allows 10 ms per request. Each cache miss parses every Discussion's plain
  text body, so the cost grows with the total length of all Discussions.
