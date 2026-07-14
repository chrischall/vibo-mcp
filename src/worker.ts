import { createConnector } from '@chrischall/mcp-connector';
import { ViboClient } from './client.js';
import { viboAuth, type ViboProps } from './vibo-auth.js';
import { inlineUploadResolver } from './upload-source.js';
import { registerProfileTools } from './tools/profile.js';
import { registerEventTools } from './tools/events.js';
import { registerSectionTools } from './tools/sections.js';
import { registerSongTools } from './tools/songs.js';
import { registerPlaylistTools } from './tools/playlists.js';
import { registerNotificationTools } from './tools/notifications.js';
import { registerQuestionTools } from './tools/questions.js';
import { registerSongManagementTools } from './tools/song-management.js';
import { registerCommentTools } from './tools/comments.js';
import { registerIdeasTools } from './tools/ideas.js';
import { registerImportTools } from './tools/imports.js';
import { registerCollaborationTools } from './tools/collaboration.js';
import { registerSectionEditTools } from './tools/section-edit.js';
import { registerUploadTools } from './tools/uploads.js';
import { VERSION } from './version.js';

// The Cloudflare remote-connector entrypoint: wires the same transport-neutral
// tool registrars the stdio server uses (`src/index.ts`) into
// `@chrischall/mcp-connector`'s generic OAuth + McpAgent harness. Each user logs
// in on the connector's own OAuth page with their Vibo email + password
// (`src/vibo-auth.ts`), and `buildClient` mints a per-user `ViboClient`
// constructed with those injected creds, so concurrent sessions never share a
// token.
//
// Vibo is STATELESS — there is no local cache, so unlike the OFW connector this
// Worker declares only the `MCP_OBJECT` per-session agent Durable Object (no
// cache DO, no cache provider).
//
// SCOPE — this Worker registers every tool the stdio server does EXCEPT
// `vibo_capture_session` (src/tools/session.ts), which needs the fetchproxy
// browser bridge + a signed-in browser tab that don't exist in a serverless
// runtime. The photo/file UPLOAD tools ARE included and work here: they accept
// inline base64 bytes via `inlineUploadResolver` (the Worker has no
// filesystem), so `registerUploadTools` / `registerQuestionTools` are wired with
// that resolver instead of the stdio default that reads local paths.
const { Agent, handler } = createConnector<ViboProps, ViboClient>({
  name: 'vibo-mcp',
  version: VERSION,
  auth: viboAuth,
  buildClient: (props) => new ViboClient({ email: props.email, password: props.password }),
  // Keep the SAME order as src/index.ts (minus the excluded session registrar).
  tools: [
    registerProfileTools,
    registerEventTools,
    registerSectionTools,
    registerSongTools,
    registerPlaylistTools,
    registerNotificationTools,
    // Upload-capable registrars get the inline (no-filesystem) resolver.
    (server, client) => registerQuestionTools(server, client, inlineUploadResolver),
    registerSongManagementTools,
    registerCommentTools,
    registerIdeasTools,
    registerImportTools,
    registerCollaborationTools,
    registerSectionEditTools,
    (server, client) => registerUploadTools(server, client, inlineUploadResolver),
  ],
});

// The connector's per-session MCP agent Durable Object
// (`wrangler.jsonc`'s `MCP_OBJECT` → `ViboMcpAgent`) resolves this export.
export { Agent as ViboMcpAgent };

export default handler;
