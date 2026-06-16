# vibo-mcp

MCP server for [Vibo](https://vibodj.com). Wraps the Vibo consumer GraphQL API
(`https://api.vibodj.com/v2/graphql`) and exposes 21 host/couple tools to Claude
over stdio (12 reads + 9 confirm-gated writes). Built on `@chrischall/mcp-utils`
(`runMcp`, `textResult`, `toolAnnotations`, `schemaConfirm`, error classes).

## Commands

```bash
npm run build          # tsc + esbuild bundle → dist/index.js + dist/bundle.js
npm test               # vitest run
npm run test:watch     # vitest watch
npm run test:coverage  # vitest run --coverage (v8 reporter, no thresholds)
```

Run locally (requires built `dist/` + credentials):
```bash
VIBO_EMAIL=you@example.com VIBO_PASSWORD=… node dist/index.js
```

## Tool naming

All tools are prefixed `vibo_` (e.g. `vibo_list_sections`, `vibo_add_song_to_section`).

## Architecture

```
src/
  version.ts      # single source of truth for VERSION (x-release-please-version)
  index.ts        # entry — runMcp({ name, version, banner, tools })
  client.ts       # ViboClient — GraphQL POST w/ x-token, deferred config error,
                  #   single-flight login + refresh-on-expiry + replay-once
  gql.ts          # all GraphQL operation documents (selections from introspection)
  tools/
    profile.ts        # vibo_get_me, vibo_healthcheck
    events.ts         # list_events, get_event, join_event, leave_event, create_event_contact
    sections.ts       # vibo_list_sections
    songs.ts          # get_section_songs, search_songs, add_song_to_section, toggle_song_like
    playlists.ts      # get_playlists, get_playlist_songs, export_event_to_{spotify,apple_music}
    notifications.ts  # list_notifications, get_notifications_count, mark_notifications_read
    questions.ts      # list_section_questions, answer_question
    shared.ts         # pagination + confirm-preview helpers
```

Each tool file exports `register<Domain>Tools(server)` calling
`server.registerTool(...)` and returns `textResult(...)`. `index.ts` wires them
through `runMcp`. Tool modules import the shared `client` singleton and the
operation docs from `gql.ts`.

## Auth & client

- **GraphQL, custom headers.** Vibo authenticates with `x-token` (not
  `Authorization: Bearer`), so `client.ts` is a hand-written GraphQL `fetch`
  client, not `createApiClient`.
- **Two credential paths:** `VIBO_EMAIL`+`VIBO_PASSWORD` (server-side `signIn`,
  preferred) or a captured `VIBO_ACCESS_TOKEN` (+`VIBO_REFRESH_TOKEN`) for SSO
  accounts. `VIBO_API_URL` overrides the endpoint.
- **Deferred-config-error pattern:** the constructor never throws; with no
  credentials it stores a `configError` and the server still boots + answers
  `tools/list`. The error surfaces on the first tool call.
- **Token lifecycle:** `gql()` ensures an access token (logging in on first use
  if needed), attaches `x-token`, and on an auth error re-authenticates once
  (refresh-token grant, falling back to a fresh login) and replays the request
  exactly once. Login and refresh are each single-flight so concurrent tool
  calls don't race.

## Writes are confirm-gated

Every mutating tool takes `confirm` (`schemaConfirm`). Without `confirm: true`
it makes **no** network call and returns a dry-run `preview` of the operation +
variables. See `docs/VIBO-API.md` for the pinned input shapes.

## Verification status

- All 21 GraphQL documents were validated **live** against the production schema
  (each parses + resolves to an auth error, not a field-validation error) and
  every input type was confirmed via introspection.
- The real auth-error shape (`{ code: "UNAUTHORIZED", message: "Not authorized.
  Try to log in" }` — top-level `code`) is what `isAuthError` matches.
- **Verified authenticated end-to-end** against a real account: the full read
  path (profile, events, sections, section songs/questions, search) and a
  reversible write (`toggleLike` → persisted via re-read → restored).
- **Not yet live-round-tripped:** the remaining write mutations
  (`addSongToSection`, `answerEventSectionQuestionV2`, exports, contact, etc.) —
  they share the proven `client.gql` auth path and their documents are
  live-validated + unit-tested, but mutate real event data so weren't exercised.
  Verify with a re-read before trusting each in earnest.

## Deferred follow-ups

- **Browser-tab token auto-capture** via the fetchproxy bridge: the web app
  stores `x-token`/`x-refresh-token` under obfuscated localStorage keys; verify
  the keys against a live session before building. Until then, paste tokens.

## Environment

```
VIBO_EMAIL=…             # with VIBO_PASSWORD, the preferred auth
VIBO_PASSWORD=…
VIBO_ACCESS_TOKEN=…      # alternative: captured token (SSO accounts)
VIBO_REFRESH_TOKEN=…
VIBO_API_URL=…           # optional endpoint override
```

Loaded via `loadDotenvSafely` from `.env` next to `dist/` (`override: false`, so
a host-provided value wins; the mcpb bundle externalizes `dotenv` and the host
supplies env). `readEnvVar` treats blank, `"undefined"`, `"null"`, and
unsubstituted `${FOO}` placeholders as unset.

## Versioning

Version lives in `src/version.ts` (`VERSION`, marked `x-release-please-version`),
mirrored into `package.json`, `manifest.json`, `server.json` (×2), and the two
`.claude-plugin/*` manifests. **Don't hand-bump** — release-please owns it via
`extra-files`. `versionSyncTest` fails the build if any marker drifts.

## Pull requests & release notes

Branch + PR, even for solo work. One Conventional-Commit PR title (it becomes
the squash subject release-please parses). **Don't merge PRs yourself** —
`pr-auto-review.yml` adds `ready-to-merge` on pass/warn; `auto-merge.yml`
squash-merges once `ci / ci` is green. Open a PR only when complete in one push
(auto-merge ships it; later commits orphan). Need a checkpoint? Open `--draft`.

## Gotchas

- **ESM + NodeNext**: relative imports use `.js` extensions even from `.ts`.
- **GraphQL field selections** live in `gql.ts`; they were built from live
  introspection. If you add/change a selection, re-validate it against the live
  schema (send the doc unauthenticated and confirm you get an auth error, not a
  field-validation error).
- **Auth error code is top-level** (`code`, value `UNAUTHORIZED`), not under
  `extensions` — `isAuthError` checks both plus a message fallback.
- **stdio transport**: logs go to **stderr** only — stdout is JSON-RPC.
