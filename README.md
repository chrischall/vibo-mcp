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

The server boots without credentials; the config error only surfaces on the
first tool call.

## How it works

Vibo's app talks to a GraphQL API at `https://api.vibodj.com/v2/graphql`,
authenticating with an `x-token` header obtained from an email/password
`signIn`. This server reuses that same flow server-side (no browser needed) and
wraps the host/couple operations as MCP tools. Every mutating tool is
confirm-gated: without `confirm: true` it returns a dry-run preview and makes no
network call.

See [docs/VIBO-API.md](docs/VIBO-API.md) for the reverse-engineered API notes
and [SKILL.md](SKILL.md) for the full tool list.

## Development

```bash
npm install
npm run build   # tsc + esbuild bundle → dist/
npm test        # vitest
```

## License

MIT
