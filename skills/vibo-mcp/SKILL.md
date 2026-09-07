---
name: vibo-mcp
description: Access your Vibo (vibodj.com) event music planning via MCP. Use when the user asks about their Vibo events, wedding/event timeline, song requests, playlists, or "do not play" list, or wants to add or like songs, join an event from a share link, or export songs to Spotify/Apple Music. Triggers on phrases like "what's on my Vibo timeline", "add this song to the first dance", "what songs did guests request", "join this Vibo event", or "export our playlist to Spotify". Requires vibo-mcp installed and the vibo server registered (see Setup below).
---

# vibo-mcp

MCP server for [Vibo](https://vibodj.com) — plan your event music as a host/couple: events, timeline sections, song requests, playlists, and exports, via natural language.

- **npm:** [npmjs.com/package/vibo-mcp](https://www.npmjs.com/package/vibo-mcp)
- **Source:** [github.com/chrischall/vibo-mcp](https://github.com/chrischall/vibo-mcp)

## Setup

### Option A — npx (recommended)

Add to `.mcp.json` in your project or `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "vibo": {
      "command": "npx",
      "args": ["-y", "vibo-mcp"],
      "env": {
        "VIBO_EMAIL": "you@example.com",
        "VIBO_PASSWORD": "your_password"
      }
    }
  }
}
```

### Authentication

Pick one:

- **Email + password (recommended):** set `VIBO_EMAIL` and `VIBO_PASSWORD`. The
  server signs in server-side and manages the token (refreshing as needed).
- **Captured token (for Apple/Google/Facebook accounts):** set
  `VIBO_ACCESS_TOKEN` (and `VIBO_REFRESH_TOKEN`) with values captured from a
  signed-in `web.vibodj.com` session — no password needed.
- **Browser capture (SSO, automatic):** with the fetchproxy browser extension
  installed and yourself signed into https://web.vibodj.com, run
  `vibo_capture_session` once — it grabs the token from your tab (approve the
  pair code), saves it to `~/.vibo-mcp/session.json`, and reuses it thereafter.

The server boots without credentials (so it can be installed and probed); the
config error only appears on the first tool call.

## Tools

### Reads
- `vibo_get_me` — your profile (and whether Spotify/Apple Music are connected).
- `vibo_list_events` — your upcoming (or `past:true`) events.
- `vibo_get_event` — full details for one event.
- `vibo_list_sections` — an event's timeline (Ceremony, First Dance, Dinner, …).
- `vibo_get_section_songs` — songs requested in a section, with likes/flags/comments.
- `vibo_list_section_questions` — the DJ's planning questions for a section (type, options, current answer).
- `vibo_search_songs` — find songs to add (Vibo catalog or connected Spotify).
- `vibo_list_section_song_ideas` / `vibo_list_song_ideas_songs` — browse the DJ's suggested song collections per section.
- `vibo_get_playlists` / `vibo_get_playlist_songs` — your connected-service playlists.
- `vibo_list_event_users` — the hosts and guests on an event.
- `vibo_list_notifications` / `vibo_get_notifications_count`.
- `vibo_healthcheck` — confirm connectivity + auth.

### Writes (confirm-gated)
Each mutating tool makes **no** network call unless `confirm: true`; without it
you get a dry-run preview of exactly what would be sent.

- `vibo_add_song_to_section` — add a searched song to a section.
- `vibo_remove_song_from_section` / `vibo_move_song` / `vibo_reorder_songs`.
- `vibo_update_song` — mark must-play / do-not-play, or set a comment.
- `vibo_toggle_song_like` — like/unlike a song.
- `vibo_comment_on_song` / `vibo_comment_on_section` (+ delete) — leave the DJ notes.
- `vibo_import_playlist_to_section` — pull tracks from a connected Spotify/Apple playlist.
- `vibo_join_event` — join via a share link/hash (e.g. a `vibodj.app.link/...` URL).
- `vibo_leave_event`.
- `vibo_create_event_contact` — add a host/guest contact.
- `vibo_invite_users` / `vibo_change_user_role` / `vibo_remove_user` — manage who's on the event.
- `vibo_update_section` — edit a section's name, time, or note.
- `vibo_answer_question` — answer a planning question (text / option ids / link / image+file uploads).
- `vibo_set_profile_photo` — set your profile photo from a local image.
- `vibo_capture_session` — capture your login from a signed-in browser tab (SSO accounts).
- `vibo_mark_notifications_read`.
- `vibo_export_event_to_spotify` / `vibo_export_event_to_apple_music`.

## Response shape (`view`)

**Six of this server's 39 tools take `view: "compact" | "full"`**, and on every
one of them **`compact` is the DEFAULT**. You get the slim rung without asking.

They are exactly the six reads whose GraphQL document asks Vibo for media:

| Tool | What compact drops |
| --- | --- |
| `vibo_search_songs` | `thumbnails { s180x180 original }` per track |
| `vibo_get_section_songs` | `thumbnails { s180x180 original }` per song |
| `vibo_list_song_ideas_songs` | `thumbnails { s180x180 original }` per song |
| `vibo_list_event_users` | `imageUrl` per person (both exits — merged and filtered) |
| `vibo_list_notifications` | `imageUrl` per notification |
| `vibo_get_me` | `imageUrl` |

That correspondence is not a coincidence to be maintained by hand: a test in
`tests/view.test.ts` counts the media selections in `src/gql.ts` and asserts
the roster of `view`-taking tools matches. Add a seventh selection and it fails.

**Compact here is media stripping, not a field projection.** `src/view.ts`
writes no field list, because this repo holds no captured Vibo payload to
derive one from honestly; instead it removes keys whose value is a picture,
which is subtractive and so cannot drop a field nobody knew about.

What compact does **not** touch is the point of these tools: `songUrl`, the
`links` block (`spotify` / `youtube` / `appleMusic`) and the `quality` verdict
all survive. A streaming link is this server's product, not decoration —
`vibo_add_song_to_section` cannot add anything without `songUrl`, and the
quality verdict is computed from how many services carry a track. A `null` link
survives too: an absent key and a null one are the same to `JSON.parse` but not
to a reader deciding whether a service was checked.

`view: "full"` returns Vibo's payload untouched, cover art included. There is
deliberately **no `raw` rung**: nothing here re-serialises or normalises the
GraphQL response, so `full` already IS the upstream payload and a third value
would silently alias one that exists.

### The other 33 tools have no `view`

- **The 24 mutating tools** (every confirm-gated write, plus
  `vibo_capture_session`) answer with a dry-run preview or a receipt — an id,
  a count, a status. Nothing in a receipt is decoration, and slimming one is
  how you lose the field that says what actually happened.
- **`vibo_healthcheck`** answers with a connectivity/auth diagnostic. It runs
  the same `GET_ME` document as `vibo_get_me` and still takes no rung, because
  it never returns Vibo's user object — it builds `{ok, userId, email}` here.
  A `view` on it would be a parameter that changes nothing.
- **The 8 remaining reads hand back Vibo's GraphQL payload as it arrived**, and
  their documents select no media, so there is nothing for a rung to remove.

A `view` passed to a tool that does not declare one is dropped by zod without a
warning, so a successful call is never evidence the rung was honoured. Check
the table above rather than assuming.

## Typical flow

1. `vibo_list_events` → pick an event id.
2. `vibo_list_sections` → pick a section id.
3. `vibo_search_songs` → get a song's `songUrl`/`viboSongId`.
4. `vibo_add_song_to_section` (with `confirm: true`).
