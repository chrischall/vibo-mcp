# vibo-mcp

MCP server for [Vibo](https://vibodj.com). Wraps the Vibo consumer GraphQL API
(`https://api.vibodj.com/v2/graphql`) and exposes 39 host/couple tools to Claude
over stdio (15 reads + 24 writes/actions, confirm-gated where they mutate). Built on `@chrischall/mcp-utils`
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
                  #   single-flight login + refresh-on-expiry + replay-once;
                  #   gqlUpload() for multipart (Upload scalar); setTokens() for
                  #   adopting a browser-captured session
  auth.ts         # captureViboSession() — fetchproxy browser-bridge token capture (SSO)
  session-store.ts# persist {accessToken,refreshToken} to ~/.vibo-mcp/session.json (0600)
  gql.ts          # all GraphQL operation documents (selections from introspection)
  tools/
    profile.ts          # vibo_get_me, vibo_healthcheck
    events.ts           # list_events, get_event, join_event, leave_event, create_event_contact
    sections.ts         # vibo_list_sections
    songs.ts            # get_section_songs, search_songs, add_song_to_section, toggle_song_like
    playlists.ts        # get_playlists, get_playlist_songs, export_event_to_{spotify,apple_music}
    notifications.ts    # list_notifications, get_notifications_count, mark_notifications_read
    questions.ts        # list_section_questions, answer_question (incl. image/file uploads)
    song-management.ts  # remove_song_from_section, update_song, move_song, reorder_songs
    comments.ts         # comment_on_song/section, delete_song/section_comment
    ideas.ts            # list_section_song_ideas, list_song_ideas_songs
    imports.ts          # import_playlist_to_section
    collaboration.ts    # list_event_users, invite_users, change_user_role, remove_user
    section-edit.ts     # update_section
    uploads.ts          # set_profile_photo
    session.ts          # capture_session (SSO browser token capture)
    shared.ts           # pagination + confirm-preview helpers
```

Each tool file exports `register<Domain>Tools(server)` calling
`server.registerTool(...)` and returns `textResult(...)`. `index.ts` wires them
through `runMcp`. Tool modules import the shared `client` singleton and the
operation docs from `gql.ts`.

## Auth & client

- **GraphQL, custom headers.** Vibo authenticates with `x-token` (not
  `Authorization: Bearer`), so `client.ts` is a hand-written GraphQL `fetch`
  client, not `createApiClient`.
- **Three credential paths:** (1) `VIBO_EMAIL`+`VIBO_PASSWORD` (server-side
  `signIn`, preferred); (2) a pasted `VIBO_ACCESS_TOKEN` (+`VIBO_REFRESH_TOKEN`);
  (3) **browser capture** via `vibo_capture_session` — for Apple/Google/Facebook
  SSO accounts, grabs the `x-token`/`x-refresh-token` localStorage keys from a
  signed-in `web.vibodj.com` tab through the fetchproxy bridge (`src/auth.ts`)
  and persists them to `~/.vibo-mcp/session.json` (`src/session-store.ts`), which
  the constructor loads only when **no env token AND no email/password** are set
  (so the preferred password path always wins over a possibly-stale saved
  session). `VIBO_API_URL` overrides the
  endpoint. Refreshed tokens are re-persisted in token-only mode so they survive
  restarts. `@fetchproxy/bootstrap` is **lazy-imported** (the .mcpb externalizes
  it; an eager import would crash boot) — capture works on the npm/`npx` install,
  not the bundled .mcpb.
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

- All GraphQL documents were validated **live** against the production schema
  (each parses + resolves to an auth error, not a field-validation error) and
  every input type was confirmed via introspection.
- The real auth-error shape (`{ code: "UNAUTHORIZED", message: "Not authorized.
  Try to log in" }` — top-level `code`) is what `isAuthError` matches.
- **Verified authenticated end-to-end** against a real account: the read path
  (profile, events, sections, section songs/questions, search, song ideas, event
  users) and reversible writes (`toggleLike`, `update_song` must-play,
  `comment_on_song` create+delete, `update_section` note — each persisted via
  re-read then restored), plus the multipart upload transport (server parsed the
  upload, rejecting only bogus content).
- **SSO browser capture verified live**: `vibo_capture_session` captured both
  tokens (`x-token`/`x-refresh-token`) from a signed-in `web.vibodj.com` tab via
  the fetchproxy bridge and `GET_ME` confirmed the account. The localStorage keys
  were **wrong in the first SSO ship** (the obfuscated bundle suggested
  `token`/`refreshToken`; the real keys are `x-token`/`x-refresh-token`, found by
  reading the live tab) — fixed here.
- **Not yet live-round-tripped:** `move_song`, `reorder_songs`,
  `import_playlist_to_section`, invite/role/remove user, a valid-image upload
  success. They share the proven auth path; verify with a re-read before trusting
  each in earnest.
- `eventUsers` returns nothing unless `usersType` is set, so
  `vibo_list_event_users` queries host+guest and merges when no filter is given.

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
- **Write-verification re-reads can be cached.** Re-reading a resource
  immediately after mutating it can return a *stale* body — observed live: a
  `update_section` note read back the old value right after the write, even
  though it had applied. (Same class as the MusicBrainz fleet repo's cached
  `/ws/2` re-reads.) When confirming a write by re-read, expect possible
  staleness; re-fetch after a beat, and don't conclude the write failed from a
  single immediate read. (Read tools themselves are unaffected.)
- **`@fetchproxy/bootstrap` is lazy + externalized.** Only `src/auth.ts` uses it,
  via `await import(...)` inside `captureViboSession`; the bundle script marks it
  `--external`. So the .mcpb boots fine but `vibo_capture_session` only works on
  the npm/`npx` install (node_modules present). Never add a top-level import of it.
- **stdio transport**: logs go to **stderr** only — stdout is JSON-RPC.
