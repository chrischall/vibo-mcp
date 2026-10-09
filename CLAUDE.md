# vibo-mcp

MCP server for [Vibo](https://vibodj.com). Wraps the Vibo consumer GraphQL API
(`https://api.vibodj.com/v2/graphql`) and exposes 42 host/couple tools to Claude
over stdio (15 reads + 27 writes/actions, confirmation-gated where they mutate). Built on `@chrischall/mcp-utils`
(`runMcp`, `textResult`, `toolAnnotations`, `confirmationFromEnv` / `requireConfirmationWithFallback`, error classes).

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
                  #   gqlUpload() for multipart (Upload scalar);
                  #   adoptVerifiedTokens() verifies a browser-captured pair on an
                  #   isolated client before adopting it (never the env login,
                  #   never session.json — the tool persists after it succeeds)
  auth.ts         # captureViboSession() — fetchproxy browser-bridge token capture (SSO)
  session-store.ts# persist {accessToken,refreshToken} to ~/.vibo-mcp/session.json (0600)
  gql.ts          # all GraphQL operation documents (selections from introspection)
  reorder.ts      # planMoves() — "move these after X" as single-item reorder
                  #   calls (Vibo: source lands after target; null = first)
  song-search.ts  # pure search-quality heuristics — parseSearchQuery, assessSong,
                  #   annotateSearchResults; grades each search hit
                  #   likely-original / uncertain / likely-not-original
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
    section-manage.ts   # create_section, delete_section, reorder_sections
    lookups.ts          # read-before-write helpers (sections, event perms,
                        #   section song ids, id validation)
    uploads.ts          # set_profile_photo
    session.ts          # capture_session (SSO browser token capture)
    shared.ts           # pagination + confirmWrite (confirmation gate) helpers
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
  restarts: Vibo rotates the refresh token, so for a pasted env pair the saved
  record carries a `lineage` (sha256 prefix of the pasted refresh token) and a
  restart with the SAME env pair resumes from the rotated tokens, while a newly
  pasted pair or an unrelated browser capture never shadows the env tokens. `@fetchproxy/bootstrap` is **lazy-imported** (the .mcpb externalizes
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

## Writes are confirmation-gated

Every mutating tool (all 26 except `vibo_capture_session`) takes an optional
`confirmToken` (`confirmTokenParam`) and calls `confirmWrite(ctx, …)` from
`src/tools/shared.ts` — a thin wrapper over mcp-utils' `confirmationFromEnv` +
`requireConfirmationWithFallback` — right before the write, after every existing
validation:

- A client that can show an MCP elicitation prompt (Claude Code) gets the real
  prompt; nothing is sent unless the user accepts.
- A client that cannot (claude.ai, Claude Desktop) gets the two-step token flow
  governed by `MCP_CONFIRM_MODE` (see README): the first call makes **no
  write** and returns `status: "confirmation-required"`, a `preview` of the
  GraphQL operation + the exact variables (`{ action, willSend }`) and a
  `confirmToken`; only a repeat call with the same arguments plus that token
  writes. The token is single-use and bound to the tool, the target id and a
  hash of what will be sent — a changed argument is refused as `DRAFT_CHANGED`,
  a replay as `TOKEN_REUSED`. Upload BYTES are bound too (via `payload`): the
  upload tools resolve their files before the gate on every call and hash a
  sha256 of each into the token, so inline bytes the preview shows as
  `(inline bytes)` — and a different file written at the same local `path`
  after the preview — are refused as `DRAFT_CHANGED` (fleet-audit #1139).

Some tools READ before the gate — to refuse ids that aren't in the section
(`remove_song_from_section`, `reorder_songs`, `reorder_sections`), to resolve
placement (`create_section`), or to show what a delete destroys
(`delete_section`, via `confirmWrite`'s `context`). Phase 1 may read; it never
writes. Tests for these use `tests/fake-vibo.ts`, whose `writes` spy counts
mutations only.

See `docs/VIBO-API.md` for the pinned input shapes.

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
- **Section tools verified live (2026-09-27)** on throwaway "ZZ TEST" sections
  (all deleted after; real sections never sent as sources): create with
  `afterSectionId` / `position` / append, public visibility + time + note;
  `reorder_sections` up, down, as a block, and to the start; `delete_section`
  preview counts and the `dontPlay` refusal; `add_song_to_section` verification;
  the comment limit; `remove_song_from_section` id validation.
- **Reorder semantics (measured live):** the source lands DIRECTLY AFTER
  `target`; `target: null` puts it first. (An earlier reading of the web app's
  drag code suggested "takes the target's slot" — wrong; moves up landed one
  slot late.) Song reorder (`reorderSongsBatch`) has the same semantics —
  verified live as a host in a DJ-made section ("Must Play List", ordering
  on): to the top with `null`, a move up and a move down, each reverted, and
  the section's order confirmed identical afterwards.
- **Host-created sections get `canHostsOrderSongs: false`**, whatever
  `createSection` sends, and a host's `updateSection` to turn it on is accepted
  and IGNORED. In those sections Vibo answers a host's reorder with "Action is
  not allowed for user" (uncoded; `client.ts` maps it to the permission error).
  `reorder_songs` checks the setting first and says so.
- **`description` is silently dropped** for a host by both `createSection` and
  `updateSection` (null on the reply and on re-read), so `create_section`
  doesn't take it. (`update_section` still offers it; it's a no-op for hosts.)
- **Limits (measured live):** song comment ≤ 90 (91 → "Comment should be less
  then 90 characters"), counted in UTF-16 units. Section name: the API stored
  60, so 45 is the web UI's limit, enforced here to match it.
- **Vibo's write replies can be wrong:** `removeSectionSongsV2` answers
  `success: true` for ids that aren't in the section, and `addSongToSection` has
  answered `added: true` without adding. The tools validate ids first, and
  re-read the section (up to 3 tries over ~2s) after an add.
- **Not yet live-round-tripped:** `move_song`,
  `import_playlist_to_section`, invite/role/remove user, a valid-image upload
  success. They share the proven auth path; verify with a re-read before
  trusting each in earnest.
- `eventUsers` returns nothing unless `usersType` is set, so
  `vibo_list_event_users` queries host+guest and merges when no filter is given.
  Its compact (default) rung projects members to `{_id, firstName, lastName,
  role}`; other members' emails come back only on `view: 'full'`.

## Song search is adversarial

The `searchField` catalog mixes official masters with YouTube covers, karaoke
tracks and re-uploads, and the text index ranks them by title text — which
cover uploaders game. Three behaviours measured live (fixtures in
`tests/song-search.test.ts` are verbatim captures):

- **The hyphen decides the result set.** `"Chris Stapleton - Tennessee Whiskey"`
  returned exactly one hit, the official master with six streaming links. The
  same words *without* the hyphen returned nine hits and **none** was the
  original — top was a re-upload whose `artist` field read `board`, then Sing
  King karaoke, three violin/piano covers, an instrumental and a techno edit.
- **Artist stylization is not folded.** `"Dan + Shay - Speechless"` finds the
  master; `"Dan and Shay - Speechless"` returns an acoustic cut, a `- Topic`
  upload, a live awards performance and a cover, with the master absent.
- **Artist alone** returns a short popularity-ranked subset, so a specific
  track can be missing entirely.

`src/song-search.ts` grades every hit (`quality.confidence` +`warnings`) on
artist-vs-query mismatch, placeholder/uploader artist fields, version markers
in the title, and streaming-link breadth (official masters carry several;
re-uploads are YouTube-only). It biases toward false warnings — a title
legitimately containing "cover" is flagged — because a missed karaoke track
reaches a live DJ. `annotateSearchResults` also returns a `hint` telling the
caller to re-query when the form was unhyphenated or nothing looked original.

- **`addSongToSection` can store a thinner record than search returned.**
  Adding Dan + Shay's *Speechless* (`peWhXJwn`) from a search hit carrying six
  streaming links persisted with only `appleMusic` and no thumbnails; the same
  add for Stapleton and Elvis kept the full set. `viboSongId`/`title`/`artist`
  were correct, so the DJ still gets the right track — but don't treat the
  stored `links` blob as a faithful copy of the search result.

## Environment

```
VIBO_EMAIL=…             # with VIBO_PASSWORD, the preferred auth
VIBO_PASSWORD=…
VIBO_ACCESS_TOKEN=…      # alternative: captured token (SSO accounts)
VIBO_REFRESH_TOKEN=…
VIBO_API_URL=…           # optional endpoint override
VIBO_UPLOAD_DIR=…        # optional; the only dir local-path uploads may read
                         #   (default ~/Downloads/vibo-mcp; dotfiles, symlinks
                         #   out of it, and files >25 MiB are refused; photo
                         #   slots also refuse ANY symlink and need image magic
                         #   bytes — mcp-utils vetUploadFile)
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

<!-- pr-workflow:v3 -->
## Pull requests & release notes

Fleet policy — Conventional-Commit PR titles, labels, the auto-review /
auto-merge ladder, auto-review follow-up issues, PR timing, and release PRs —
lives in `~/.claude/CLAUDE.md`. Don't restate it here; the copies drifted.

Shared technical conventions (publishing, bundling, versioning guards,
write-verification, transport archetypes, testing traps) live in
[`chrischall/workflows`](https://github.com/chrischall/workflows):
`docs/fleet-conventions.md`, plus `README.md` for the CI pipeline contract.

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
