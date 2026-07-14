# Deploying the Vibo remote connector

This is the operator runbook for standing up `vibo-mcp` as a hosted Cloudflare
Worker — a "remote connector" that anyone you share the URL with can add to
claude.ai (web, desktop, or mobile), each logging in with their own Vibo email
and password. It's a manual, one-time (per operator) process; there is no CI/CD
path for it, and none of the steps below can be done by an agent since they
require your own Cloudflare account.

If you just want the server on your own machine talking only to your own Vibo
account, you don't need any of this — see the main [README](../README.md) for the
local stdio / `.mcpb` install instead.

## Scope of the hosted connector

The connector registers **every tool the local stdio server has except one**:

- **Excluded:** `vibo_capture_session` — the SSO browser-token capture tool. It
  needs the fetchproxy browser bridge and a signed-in browser tab, neither of
  which exists in a serverless runtime. (Its purpose — signing in an
  Apple/Google/Facebook SSO account — doesn't apply here anyway; see below.)
- **Included, with a twist:** the photo/file **upload** tools
  (`vibo_set_profile_photo`, and `vibo_answer_question` with photo/file answers)
  work on the connector. The Worker has no filesystem, so instead of a local
  file `path` they accept the file bytes **inline as base64** (`fileData` on
  `vibo_set_profile_photo`; `images` / `files` arrays of `{ data, filename }` on
  `vibo_answer_question`). The local stdio server still uses local paths.

### Password accounts only

Each user authenticates with their Vibo **email + password**, which the
connector uses to run Vibo's server-side `signIn`. **SSO-only accounts
(Apple/Google/Facebook, no password) are not supported on the hosted
connector** — they have no password to sign in with. Such users should use the
local stdio server's `vibo_capture_session` browser-capture flow instead.

## Prerequisites

- A Cloudflare account (free tier is fine).
- Node and this repo checked out with dependencies installed (`npm install`).
- **No app-level Vibo API keys are required.** Vibo has no operator-shared
  `client_id` / `client_secret`. Each user authenticates with their own Vibo
  email + password, collected by the connector's own OAuth login page (step 4) —
  you never handle anyone's Vibo credentials.

## Steps

### 1. Log in to Cloudflare

```sh
npx wrangler login
```

This opens a browser to authorize the CLI against your Cloudflare account. (A
token with **Workers Scripts:Edit + Workers KV Storage:Edit** — the "Edit
Cloudflare Workers" template — works too; a read-only/zone-only token fails the
KV create + deploy.)

### 2. Create the OAuth KV namespace

The connector stores OAuth state and per-user session data (including each user's
encrypted Vibo email + password) in a KV namespace bound as `OAUTH_KV` (see
`wrangler.jsonc`). Give it a distinct title so it never cross-wires with another
connector's namespace:

```sh
npx wrangler kv namespace create vibo-connector-oauth
```

The command prints something like:

```
{ "binding": "OAUTH_KV", "id": "abcd1234..." }
```

Copy the returned `id` into `wrangler.jsonc`, replacing the
`"REPLACE_WITH_OAUTH_KV_NAMESPACE_ID"` placeholder:

```jsonc
"kv_namespaces": [{ "binding": "OAUTH_KV", "id": "abcd1234..." }],
```

### 3. Deploy

```sh
npm run worker:deploy
```

This runs `wrangler deploy`, which builds and pushes `src/worker.ts` (plus the
`ViboMcpAgent` per-session agent Durable Object binding, and the `OAUTH_KV`
namespace from step 2). On success it prints the deployed URL:

```
https://vibo-connector.<your-subdomain>.workers.dev
```

Because `wrangler.jsonc` also declares a custom-domain route
(`connector.vibo.nullnet.app`, matching ofw-mcp's `connector.ofw.nullnet.app`
and zola-mcp's `connector.zola.nullnet.app`), the connector is additionally
served at:

```
https://connector.vibo.nullnet.app
```

Use the custom domain as the stable production URL you share. (The zone must be
in the deploying Cloudflare account; if it isn't, remove the `routes` entry from
`wrangler.jsonc` and use the `*.workers.dev` URL instead. The edge TLS cert
provisions a few minutes after the first deploy — the `*.workers.dev` URL works
immediately.) Note whichever URL you use — it's what gets added as a connector,
with `/mcp` appended.

> **Stateless — no cache Durable Object.** Vibo reads always hit the live API, so
> unlike the OFW connector there is no per-user cache: the only Durable Object is
> `ViboMcpAgent` (the per-session MCP agent), declared in `wrangler.jsonc` with a
> `v1` SQLite migration applied automatically by `wrangler deploy`.

Before deploying to production, you can sanity-check the Worker locally with:

```sh
npm run worker:dev
```

confirm it bundles without deploying:

```sh
npx wrangler deploy --dry-run
```

and run the Worker-specific test suite (Miniflare / real Workers runtime) with:

```sh
npm run worker:test
```

### 4. Add it as a connector in claude.ai

1. Go to claude.ai → **Settings** → **Connectors** → **Add custom connector**.
2. Paste the deployed URL with `/mcp` appended — the custom domain
   `https://connector.vibo.nullnet.app/mcp` (or, without a custom domain,
   `https://vibo-connector.<your-subdomain>.workers.dev/mcp`).
3. Claude will open the connector's login page (served by the Worker at
   `/authorize`) and prompt for a **Vibo email and password**. The credentials
   are verified by running Vibo's `signIn` before the session is created — bad
   credentials are rejected on the login page.

This connector is unlisted: it only shows up for people you've explicitly shared
the URL with, not in any public directory. Anyone with the URL who supplies their
own valid Vibo email + password can use it under their own account.

### 5. Verify on the mobile Claude app

Connectors added on claude.ai sync to all clients for that account, including the
**mobile Claude app**. On mobile:

1. Confirm the connector appears (Settings → Connectors) and shows as connected.
2. Run a read, e.g. ask Claude to run `vibo_healthcheck` or `vibo_list_events`.
3. Optionally run a low-stakes confirm-gated write.

If both work, the deploy is verified end-to-end.

## How auth works

- There are **no operator-level Vibo credentials.** Vibo has no shared app
  `client_id` / `client_secret`; the connector authenticates each user
  individually.
- Each **user** who adds the connector logs in with their *own* Vibo email +
  password, via the login page the Worker serves at `/authorize`. They are
  verified (a server-side `signIn` against `api.vibodj.com`) before the session
  is created.
- Those credentials are stored **encrypted at rest** in the OAuth provider's
  KV-backed "props" (`OAUTH_KV`), scoped to that user's session. Vibo mints only
  short-lived access tokens (no long-lived standalone refresh token), so — like
  the OFW connector — the stored email + password are used to build a per-user
  `ViboClient` that re-runs `signIn` and refreshes tokens in memory as needed.
  They are used only to sign into Vibo on that user's behalf, never for anything
  else.

## Rotation / teardown

There are no operator secrets to rotate for Vibo auth (users manage their own
Vibo credentials; a user rotates by re-adding the connector with a new
password).

Tear down the whole connector:

```sh
npx wrangler kv namespace delete --namespace-id <id-from-step-2>
```

then delete the Worker itself from the Cloudflare dashboard (Workers &
Pages → `vibo-connector` → Settings → Delete), or via:

```sh
npx wrangler delete
```

Deleting the KV namespace invalidates every stored user session — everyone who
had added the connector will need to log in again if it's redeployed.
