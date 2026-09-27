# vibo-mcp

MCP server for [Vibo](https://vibodj.com) (vibodj.com) — plan your event music
as a host/couple. Browse your events and timeline, see and add song requests,
like songs, manage notifications, and export selections to Spotify/Apple Music,
all via natural language.

> Developed and maintained by AI (Claude Code). Use at your own discretion.
> Unofficial — not affiliated with Vibo. Works only with your own account/data.

## Install

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

Choose one method:

| Method | Env vars | When |
|--------|----------|------|
| Email + password (recommended) | `VIBO_EMAIL`, `VIBO_PASSWORD` | You sign in to Vibo with an email/password. |
| Captured token | `VIBO_ACCESS_TOKEN` (+ `VIBO_REFRESH_TOKEN`) | Your account uses Apple/Google/Facebook sign-in (no password). Capture `x-token`/`x-refresh-token` from a signed-in `web.vibodj.com` session. |
| Browser capture (SSO) | run `vibo_capture_session` | With the [ContextMint Bridge](#contextmint-bridge-for-sso-capture) browser extension installed and signed into `web.vibodj.com`, capture the token automatically (saved to `~/.vibo-mcp/session.json`). |

The server boots without credentials; the config error only surfaces on the
first tool call.

### ContextMint Bridge (for SSO capture)

`vibo_capture_session` reads your signed-in tab through the ContextMint Bridge
browser extension. Install it from
[github.com/nullnet-app/contextmint-bridge/releases](https://github.com/nullnet-app/contextmint-bridge/releases):

- **Chrome:** download the Chrome zip, unzip it, and load it unpacked at
  `chrome://extensions` (Developer mode → Load unpacked).
- **Safari:** not available yet — it will ship inside the ContextMint app,
  which has no public download. Use Chrome for now.

Approve the pair code the extension shows on first use.

ContextMint Bridge is the fetchproxy browser extension under its new name, from
the same maintainer — fetchproxy's own README
(https://github.com/chrischall/fetchproxy#extension) points to it. Its source is
public at https://github.com/nullnet-app/contextmint-bridge: build it yourself,
or check a release zip against the `.sha256` file published beside it
(`shasum -a 256 -c contextmint-bridge-chrome-<version>.zip.sha256`).

### Uploads

`vibo_set_profile_photo` and photo/file answers to `vibo_answer_question` only
read local files from the upload directory — `VIBO_UPLOAD_DIR`, default
`~/Downloads/vibo-mcp`. Copy a file there before asking Claude to upload it.
Hidden files, symlinks that lead outside the directory, and files over 25 MiB
are refused, and photo slots need an image file.

### Timeline sections and limits

- `vibo_create_section` adds a section and can place it (`afterSectionId` or a
  0-based `position`). The web app only appends new sections to the end.
  Visibility is `host` (default, "Me and DJ") or `public` (guests too).
- `vibo_delete_section` previews the section's name, its song count and its
  answered questions before deleting. It refuses the DJ's do-not-play list
  (`dontPlay`) and timeline dividers (`headline`) unless you pass `force: true`.
- `vibo_reorder_sections` moves one or more sections to directly after another
  section, or to the start. `vibo_reorder_songs` does the same for songs within
  a section.

Vibo's limits, checked before anything is sent:

| What | Limit |
|---|---|
| Section name | 45 characters (the web app's limit) |
| Song comment (`vibo_update_song`) | 90 characters (an emoji counts as 2) |

A host can only do some things when the DJ's settings allow it: adding or
reordering sections (event settings), or reordering one section's songs (that
section's "hosts can order songs"). Vibo turns "hosts can order songs" **off**
for every section a host creates, and only the DJ can turn it on. When a
setting blocks you, the tool says which one instead of returning Vibo's bare
"Action is not allowed for user".

Vibo doesn't store a section description set by a host, so
`vibo_create_section` takes a note (for the DJ) instead.

### Confirmations

Every write (adding or removing songs, comments, invites, exports, answers,
uploads, …) is confirmed before anything is sent to Vibo.

| variable | default | |
|---|---|---|
| `MCP_CONFIRM_MODE` | `ask-user` | What a write does on a client that cannot show a confirmation prompt (claude.ai, Claude Desktop). `ask-user`: two steps — the first call does nothing and returns a preview plus a token, and the model must get your approval in chat before calling again with it. `auto`: the same two steps, but the model may use the token after reviewing the preview itself. `refuse`: writes are refused on such clients. A client that can show prompts (Claude Code) always gets the real prompt. An unrecognised value is treated as `refuse`. |
| `MCP_CONFIRM_TTL_SECONDS` | `600` | How long a token stays valid. |
| `MCP_CONFIRM_SECRET` | random per process | Signing key; set it only if tokens must survive a server restart. |

A token works once, only for the tool and arguments it was previewed with: a
changed argument or a reused token is refused and nothing is sent.

## How it works

Vibo's app talks to a GraphQL API at `https://api.vibodj.com/v2/graphql`,
authenticating with an `x-token` header obtained from an email/password
`signIn`. This server reuses that same flow server-side (no browser needed) and
wraps the host/couple operations as MCP tools. Every mutating tool asks you to
confirm first: a client that can show a confirmation prompt (Claude Code) shows
one; otherwise the first call makes no network call and returns a preview plus a
`confirmToken`, and only a repeat call with that token makes the change (see
[Confirmations](#confirmations)).

See [docs/VIBO-API.md](docs/VIBO-API.md) for the reverse-engineered API notes
and [skills/vibo-mcp/SKILL.md](skills/vibo-mcp/SKILL.md) for the full tool list.

## Development

```bash
npm install
npm run build   # tsc + esbuild bundle → dist/
npm test        # vitest
```

## License

MIT
