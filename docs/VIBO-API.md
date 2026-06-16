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
`getSectionSongs`, `getSongs` (search), `getPlaylists`, `getPlaylistSongs`,
`getNotifications`, `getNotificationsCount`.

Writes (confirm-gated): `addSongToSection`, `toggleLike`, `joinEventViaDeepLink`
/ `joinEventByHash`, `leaveEvent`, `createEventContact`, `exportEventToSpotify`,
`exportEventToAppleMusic`, `markAsRead`.

All 19 operation documents in `src/gql.ts` were validated against the live
schema (each parses + resolves to an auth error rather than a field-validation
error). **An authenticated round-trip has NOT yet been run** — it is gated on
real credentials (`VIBO_EMAIL`/`VIBO_PASSWORD` or a captured token).

## Deferred to a follow-up

- **Section questions** (`getEventSectionQuestionsV` read +
  `answerEventSectionQuestionV` write): a complex typed (QuestionV2) shape whose
  root fields aren't exposed via standard introspection. Not coded against a
  guess — needs a live capture of a real answer payload.
- **Browser-tab token auto-capture**: capturing `x-token`/`x-refresh-token` from
  a signed-in `web.vibodj.com` tab via the fetchproxy bridge. The web app stores
  them under obfuscated localStorage keys; the exact keys need live verification
  before coding. Until then, paste tokens via `VIBO_ACCESS_TOKEN` /
  `VIBO_REFRESH_TOKEN`.
