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

Writes (confirm-gated): `addSongToSection`, `toggleLike`, `joinEventViaDeepLink`
/ `joinEventByHash`, `leaveEvent`, `createEventContact`,
`answerEventSectionQuestionV2`, `exportEventToSpotify`,
`exportEventToAppleMusic`, `markAsRead`.

All 21 operation documents in `src/gql.ts` were validated against the live
schema. The read path was verified authenticated end-to-end against a real
account, plus a reversible `toggleLike` write (persisted + restored). The
remaining write mutations are live-validated + unit-tested but not yet
round-tripped (they mutate real event data).

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

## Deferred to a follow-up

- **Browser-tab token auto-capture**: capturing `x-token`/`x-refresh-token` from
  a signed-in `web.vibodj.com` tab via the fetchproxy bridge. The web app stores
  them under obfuscated localStorage keys; the exact keys need live verification
  before coding. Until then, paste tokens via `VIBO_ACCESS_TOKEN` /
  `VIBO_REFRESH_TOKEN`.
