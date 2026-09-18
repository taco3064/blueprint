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

A successful feed is cached for five minutes (`Cache-Control: public, max-age=300`, `Vary:
Origin`). A GitHub or configuration failure returns `502` with `{"error": "Live evidence is
unavailable."}`, cached for one minute so a broken App is not retried on every request. Failure
details go only to the Worker log.

## Activation

Everything below is done once by the repository owner. Nothing in it is committed except the two
App identifiers and the Worker URL, which are not secrets.

### 1. GitHub App

Create a GitHub App under the owner account
(**Settings → Developer settings → GitHub Apps → New GitHub App**), for example
`Blueprint Evidence Reader`:

- **Homepage URL** — `https://taco3064.github.io/blueprint/`.
- **Callback URL / Setup URL** — leave empty; clear **Request user authorization (OAuth) during
  installation**.
- **Webhook** — clear **Active**. No webhook URL, no events.
- **Repository permissions** — **Discussions: Read-only**. Leave every other permission at
  **No access** (GitHub adds **Metadata: Read-only** itself).
- **Where can this GitHub App be installed?** — **Only on this account**.

After creating it:

1. Note the **App ID** on the App's **General** page. This is `GITHUB_APP_ID`.
2. **Generate a private key**. GitHub downloads a `.pem` file. Keep it on your machine only; it
   goes straight into Cloudflare in step 3 and is never pasted into an issue, pull request, chat,
   or repository file. GitHub App keys do not expire — they stay valid until deleted.
3. **Install App** → the owner account → **Only select repositories** → `taco3064/blueprint`.
4. On the installation's settings page, the URL ends in
   `/settings/installations/<number>`. That number is `GITHUB_INSTALLATION_ID`.

The Worker asks GitHub for an installation token limited to `blueprint` with `discussions: read`,
so the token it uses cannot exceed that scope even if the App's permissions are widened later. If
the live query ever fails for lack of permission, record the exact GraphQL error from the Worker
log before changing any App permission.

### 2. Cloudflare

- A Cloudflare account on **Workers Free**.
- A `workers.dev` subdomain (**Workers & Pages → Overview → Subdomain**). The Worker will be
  served at `https://blueprint-evidence-feed.<subdomain>.workers.dev`.

Stay on Workers Free. No API token, custom domain, KV, D1, R2, or Durable Object is needed.

### 3. Deploy

From this directory:

1. Set `GITHUB_APP_ID` and `GITHUB_INSTALLATION_ID` under `vars` in `wrangler.jsonc`.
2. Install the tooling and sign in (browser OAuth):

   ```sh
   npm ci
   npx wrangler login
   ```

3. Deploy, then store the private key as a Worker secret. The key never touches a file here and
   never appears in `wrangler.jsonc`:

   ```sh
   npx wrangler deploy
   npx wrangler secret put GITHUB_PRIVATE_KEY < /path/to/blueprint-evidence-reader.private-key.pem
   ```

   In Windows PowerShell, which has no `<` redirection:

   ```powershell
   Get-Content -Raw C:\path\to\blueprint-evidence-reader.private-key.pem | npx wrangler secret put GITHUB_PRIVATE_KEY
   ```

   The key GitHub downloads (`BEGIN RSA PRIVATE KEY`) is accepted as is; a PKCS#8 key
   (`BEGIN PRIVATE KEY`) works too. Pasting the key into the dashboard
   (**Worker → Settings → Variables and Secrets → Add → Secret**) is equivalent.

4. Check the endpoint:

   ```sh
   curl -i https://blueprint-evidence-feed.<subdomain>.workers.dev/discussions
   curl -i -H "Origin: https://taco3064.github.io" https://blueprint-evidence-feed.<subdomain>.workers.dev/discussions
   ```

   The first returns the repository's Discussions. The second also carries
   `Access-Control-Allow-Origin: https://taco3064.github.io`.

5. Set `EVIDENCE_FEED_URL` in `docs/.vitepress/theme/evidence-feed.ts` to
   `https://blueprint-evidence-feed.<subdomain>.workers.dev/discussions` and merge it. From then on,
   Discussion changes need no further commit or docs deployment.

### Rotating the key

Generate a new key on the App page, run `npx wrangler secret put GITHUB_PRIVATE_KEY` with it, then
delete the old key on the App page.

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
