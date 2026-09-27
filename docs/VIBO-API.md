# Vibo API notes

Reverse-engineered from the Vibo web app (`https://web.vibodj.com`, a
Create-React-App SPA) and confirmed against live schema introspection of the
production endpoint. No secrets, cookies, or tokens are recorded here.

## Endpoint & transport

- **GraphQL**, single endpoint: `https://api.vibodj.com/v2/graphql` (Express,
  `access-control-allow-origin: *`). A `test.api.vibodj.com` mirror exists.
- Override with `VIBO_API_URL` if needed.
- **Introspection is enabled** in production — input/field shapes below were
  verified with `__type` queries, not guessed.

## Authentication

Custom headers, **not** `Authorization: Bearer`:

- `x-token: <accessToken>` — on every authenticated request.
- `x-refresh-token` / `x-client-type` / `x-client-version` also exist in the web
  client; only `x-token` is required server-side for our calls.

Flow:

```graphql
mutation signIn($email: String!, $password: String!) {
  signIn(email: $email, password: $password) { accessToken refreshToken }
}
mutation refreshToken($refreshToken: String!) {
  refreshToken(refreshToken: $refreshToken) { accessToken refreshToken }
}
```

- `signIn` → access + refresh token pair. Social sign-in (`signInApple`,
  `signInGoogle`, `signInFacebook`) returns the same `AuthResponse` shape; this
  MCP supports email/password + a pasted captured token (for SSO accounts).
- **Auth error shape (important):** an expired/missing session returns
  `{ "code": "UNAUTHORIZED", "message": "Not authorized. Try to log in" }` — the
  code is **top-level** (not under `extensions`) and the value is `UNAUTHORIZED`
  (not `UNAUTHENTICATED`). `client.ts#isAuthError` matches this to trigger a
  single refresh + replay.

## Input types (from introspection)

| Type | Fields |
|------|--------|
| `PaginationInput` | `skip: Int!`, `limit: Int!` |
| `EventsFilterInput` | `q`, `statusId`, `past`, `isDeleted`, `djId`, `forDj` |
| `SortInput` | `field: String!`, `direction: SortDirectionEnum!` |
| `SectionSongsFilter` | `q`, `isMustPlay`, `isFlagged`, `hasComments`, `hostLiked` |
| `SongsSortInput` | `field: SongSortFieldsEnum!` (`likesCount`/`createdAt`/`title`), `direction` (`asc`/`desc`) |
| `SongsFilter` | `q: String`, `source: SongsSource` (`spotify`/`searchField`) |
| `AddSongToSectionInput` | `song: AddSongInput!` |
| `AddSongInput` | `songUrl: String!`, `viboSongId: ID`, `title`, `artist`, `thumbnails: ThumbnailsInput` |
| `CreateContactInput` | `role: EventUserType!` (`host`/`guest`), `email: String!`, `firstName`, `lastName`, `phoneCode`, `phoneNumber` |
| `ExportEventFilter` | `isFlagged: Boolean` |
| `MusicImportSource` (enum) | `spotify`, `appleMusic` |

## Operations wrapped (host/couple surface)

Reads: `getMe`, `upcomingEvents`, `historyEvents`, `event`, `sections`,
`getSectionSongs`, `getSongs` (search), `getEventSectionQuestionsV2`,
`getPlaylists`, `getPlaylistSongs`, `getNotifications`, `getNotificationsCount`.

Writes (confirmation-gated — see README "Confirmations"): `addSongToSection`, `toggleLike`, `joinEventViaDeepLink`
/ `joinEventByHash`, `leaveEvent`, `createEventContact`,
`answerEventSectionQuestionV2`, `exportEventToSpotify`,
`exportEventToAppleMusic`, `markAsRead`.

All operation documents in `src/gql.ts` were validated against the live schema.
The read path was verified authenticated end-to-end against a real account, plus
a reversible `toggleLike` write (persisted + restored). The remaining write
mutations are live-validated + unit-tested but not yet round-tripped (they mutate
real event data). See the v2/v3 + Uploads sections below for the added operations.

### Section questions (V2)

- Read: `getEventSectionQuestionsV2(eventId, sectionId)` →
  `QuestionsV2Response { questions: [QuestionV2!]!, progress }`. Each
  `QuestionV2` has `settings.type` ∈ `text | checkbox | radio | select | pairs |
  header`, `question.options { _id title isOther }`, and `answer { text,
  selectedOptions: [String!]!, link: [String!]! }`.
- Write: `answerEventSectionQuestionV2(eventId, sectionId, questionId, payload:
  AnswerQuestionV2Input!)` where `payload = { answer: { text?, selectedOptions?:
  [String!] (option _ids), link?: [String!], otherOptionTitle? } }`. The
  non-null list fields default to empty, so only the relevant field need be sent.
  Returns `QuestionV2Response { progress, question {...} }`. (`images`/`files`
  Upload answers and `phoneNumber`/`location`/`contact` structured answers are
  not wrapped yet.)

## SSO browser token capture (implemented)

Apple/Google/Facebook accounts have no password. `vibo_capture_session` (→
`src/auth.ts`) uses `@fetchproxy/bootstrap` to read the Vibo web app's token
**localStorage keys directly** — **`x-token`** (access) and **`x-refresh-token`**
(both ~348-char JWTs), on the `web.vibodj.com` origin. **Keys verified LIVE
against a signed-in tab** — the obfuscated web bundle (`c.d`/`c.c`) misleadingly
suggested `token`/`refreshToken`; the real keys match the header names. Config:
`bootstrap({ domains:['vibodj.com'], storageSubdomain:'web', declare:{ localStorage:['x-token','x-refresh-token'] } })`
→ `session.localStorage['x-token']` / `['x-refresh-token']`. Persisted to
`~/.vibo-mcp/session.json` (0600) via `src/session-store.ts` only after a GET_ME
verify; the client loads it when no env token / email-password is present, and
re-persists rotated tokens in token-only mode. The bridge touches only the
one-time capture; all real calls use plain node `fetch` with `x-token`.
(Lazy-imported + esbuild-`--external`, so the .mcpb boots but capture requires
the npm install.) **Verified end-to-end live**: captured both tokens from a
signed-in tab and confirmed `GET_ME`.

## v2 / v3 operations (added)

All shapes pinned via authenticated introspection; every document live-validated.

**Song management:** `removeSectionSongsV2(eventId, sectionId, songIds:[ID!]!)`,
`updateSectionSongs(..., payload: UpdateSectionSongInput{isMustPlay, isFlagged, comment})`,
`moveSectionSongsV2`, `reorderSongsBatch(..., sourceSongIds, targetSongId)` (target semantics: see Section management).

**Comments:** `createSongComment` / `createSectionComment(payload: CreateCommentInput{message})`,
`deleteSongComment` / `deleteSectionComment`.

**Song ideas (DJ suggestions):** `getEventSectionSongIdeas → SongIdeasResponse{songIdeas:[SongIdeasPreview], totalCount}`;
`getEventSectionSongIdeasSongs(songIdeasId) → {songs:[SearchedSong], totalCount}`. Promote a suggested
song to the playlist with the existing `addSongToSection`.

**Playlist import:** `importPlaylistToSectionWeb(eventId, sectionId, playlistId, source: MusicImportSource!, tracksToAdd:[ID]!, tracksToIgnore:[ID]!)`.

**Collaboration:** `eventUsers(eventId, usersType, pagination) → {users:[User], totalCount}` — **returns empty
unless `usersType` is set**, so the tool queries host+guest and merges. `inviteUserViaEmail(eventId, type, text, emails)`,
`changeUserTypeInEvent`, `removeUserFromEvent` (all return Boolean).

**Section editing:** `updateSection(eventId, sectionId, payload: UpdateSectionInput{name,time,note,description,...})`
— subject to per-section host-edit permissions.

**Dropped (DJ-only / not host-usable):** `generatePlaylist` (requires a `computerId` scanner),
prep-mode, templates/favorites, child-DJ/scanner management.

## Section management (create / delete / reorder)

Source: the web.vibodj.com bundle's own documents and handlers (Timeline "+" →
Add section, the section "…" menu → Delete, the timeline drag handler), checked
against live introspection. Each document was sent unauthenticated and got
`UNAUTHORIZED`, not a validation error.

- `createSection(eventId, payload: CreateSectionInput!) → Section`.
  `CreateSectionInput { name!, time, type: simple|headline, description,
  sectionImage, settings: SectionSettingsInput, insertBeforeSectionId, headlineColor }`.
  There's no `note`: set it afterwards with `updateSection`.
  **Placement:** `insertBeforeSectionId` (the web app's "add in the middle"
  button); omitted means append.
  **Visibility** is not a field. The UI's "Who will see this section" maps to
  settings: host ("Me and DJ") = `{visibleForGuests:false, visibleForHosts:true}`,
  public ("Guests") = `{visibleForGuests:true, visibleForHosts:true}`.
  The UI's other create defaults: `timeEnabled, songsEnabled, notesEnabled,
  canHostsOrderSongs, canHostDeleteSection, notesVisibleForHosts,
  canHostChangeSectionName, canHostChangeSectionTime` all `true`, plus
  `songsLimit`/`mustPlayLimit` from the event's `settings.sectionSongsLimit` /
  `sectionMustPlayLimit`.
  **Name limit:** 45 (the bundle constant behind `nameMustBeCharactersOrLess`).
- `removeSection(eventId, sectionId) → Boolean`. `Section.canRemove` says
  whether the caller may delete it; the DJ sets "who can delete section".
- `reorderSections(eventId, sourceSectionId, targetSectionId) → Boolean`. The
  drag handler sends `targetSectionId = list[addedIndex]` from the pre-drag
  list: the source takes the target's slot.
- `reorderSongsBatch(eventId, sectionId, sourceSongIds, targetSongId)` is what
  the song drag handler sends, with section-song `_id`s and the same
  `list[addedIndex]` target rule. A host can drag only when
  `section.settings.canHostsOrderSongs` is on. The single `reorderSongs` doc
  exists in the bundle but is unused.
- Event-level host permissions: `event.settings { canHostCreateSections,
  canHostReorderSections }`, plus `event.isLocked`.
- Song comment limit: Vibo rejects 90+ characters (observed; the bundle also
  has a 90 constant).

## Uploads (the `Upload` scalar)

Vibo's `Upload` scalar uses the **graphql-multipart-request spec**. `client.gqlUpload(query, variables, fileMap)`
builds the multipart body: `operations` (JSON `{query, variables}` with `null` at each upload slot), `map`
(`{ "0": ["variables.photo"], ... }`), then file parts streamed via `fs.openAsBlob`. Sends `x-token` +
`apollo-require-preflight: true`; no `content-type` (fetch sets the boundary). Same single-retry-on-expiry as `gql`.

- `uploadUserPhoto(photo: Upload!) → {url, mimetype, filename}` → `vibo_set_profile_photo`.
- `answerEventSectionQuestionV2` `payload.answer.images:[Upload!]` / `files:[Upload!]` → `vibo_answer_question`
  routes through `gqlUpload` when `imagePaths`/`filePaths` are given.

> Live status: all read paths + a reversible `toggleLike` verified end-to-end against a real account. The
> write mutations (incl. uploads) are live-validated + unit-tested but not yet round-tripped (they mutate real data).
