import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { ViboClient } from '../src/client.js';
import { inlineUploadResolver } from '../src/upload-source.js';
import { registerProfileTools } from '../src/tools/profile.js';
import { registerEventTools } from '../src/tools/events.js';
import { registerSectionTools } from '../src/tools/sections.js';
import { registerSongTools } from '../src/tools/songs.js';
import { registerPlaylistTools } from '../src/tools/playlists.js';
import { registerNotificationTools } from '../src/tools/notifications.js';
import { registerQuestionTools } from '../src/tools/questions.js';
import { registerSongManagementTools } from '../src/tools/song-management.js';
import { registerCommentTools } from '../src/tools/comments.js';
import { registerIdeasTools } from '../src/tools/ideas.js';
import { registerImportTools } from '../src/tools/imports.js';
import { registerCollaborationTools } from '../src/tools/collaboration.js';
import { registerSectionEditTools } from '../src/tools/section-edit.js';
import { registerUploadTools } from '../src/tools/uploads.js';

// Handshake + tool-surface test for the Vibo Cloudflare remote connector, run
// inside the real Workers runtime (Miniflare) via
// `@cloudflare/vitest-pool-workers` against `wrangler.jsonc`. It proves:
//   1. the OAuth default handler serves discovery + the login page, and
//   2. an unauthenticated `/mcp` request is rejected before any tool code runs;
//   3. the exact registrar wiring `src/worker.ts` uses registers the intended
//      REDUCED tool surface — every stdio tool EXCEPT the browser-capture tool
//      `vibo_capture_session`, and WITH the upload tools present (they run from
//      inline base64 bytes on the Worker, which has no filesystem).
//
// The full authenticated `initialize` + `tools/list` handshake over `/mcp`
// requires a real OAuth access token minted via `workers-oauth-provider`'s
// KV-backed grant flow, which would mean a live Vibo login — out of scope for a
// hermetic in-process test. So #3 asserts tool registration through the same
// in-memory MCP harness the stdio suite uses, wired exactly as `worker.ts` wires
// it, rather than through the token-gated `/mcp` route.

describe('Vibo Cloudflare connector — OAuth surface', () => {
  it('serves the OAuth authorization-server discovery document', async () => {
    const res = await SELF.fetch('https://example.com/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const meta = (await res.json()) as { authorization_endpoint?: string; token_endpoint?: string };
    expect(meta.authorization_endpoint).toContain('/authorize');
    expect(meta.token_endpoint).toContain('/token');
  });

  it('rejects an unauthenticated /mcp request', async () => {
    const res = await SELF.fetch('https://example.com/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('GET /authorize renders the Vibo login page with email + password fields', async () => {
    // No `client_id` query param: the login page renders without needing a
    // registered OAuth client, which is all we verify here.
    //
    // `redirect_uri` IS required though — don't drop it. Since
    // workers-oauth-provider 0.8.x, `parseAuthRequest` calls
    // `validateRedirectUriScheme()` unconditionally, and that rejects any value
    // with no scheme — including the empty string an absent `redirect_uri`
    // becomes — with "Invalid redirect URI". (0.0.x only screened for dangerous
    // schemes like `javascript:`.)
    const res = await SELF.fetch(
      'https://example.com/authorize?response_type=code&state=abc' +
        '&redirect_uri=' +
        encodeURIComponent('https://example.com/callback'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Vibo');
    expect(html).toContain('Vibo email');
    expect(html).toContain('Vibo password');
    expect(html).toContain('type="password"');
  });
});

describe('Vibo Cloudflare connector — tool surface', () => {
  it('registers the reduced Vibo tool set (all stdio tools except vibo_capture_session)', async () => {
    const client = new ViboClient({ email: 'x@y.com', password: 'pw' });

    // Mirror src/worker.ts's `tools` array exactly (same order, same wiring —
    // including the inline upload resolver for the upload-capable registrars).
    const harness = await createTestHarness((server) => {
      registerProfileTools(server, client);
      registerEventTools(server, client);
      registerSectionTools(server, client);
      registerSongTools(server, client);
      registerPlaylistTools(server, client);
      registerNotificationTools(server, client);
      registerQuestionTools(server, client, inlineUploadResolver);
      registerSongManagementTools(server, client);
      registerCommentTools(server, client);
      registerIdeasTools(server, client);
      registerImportTools(server, client);
      registerCollaborationTools(server, client);
      registerSectionEditTools(server, client);
      registerUploadTools(server, client, inlineUploadResolver);
    });

    try {
      const names = (await harness.listTools()).map((t) => t.name).sort();
      expect(names).toEqual(
        [
          'vibo_add_song_to_section',
          'vibo_answer_question',
          'vibo_change_user_role',
          'vibo_comment_on_section',
          'vibo_comment_on_song',
          'vibo_create_event_contact',
          'vibo_delete_section_comment',
          'vibo_delete_song_comment',
          'vibo_export_event_to_apple_music',
          'vibo_export_event_to_spotify',
          'vibo_get_event',
          'vibo_get_me',
          'vibo_get_notifications_count',
          'vibo_get_playlist_songs',
          'vibo_get_playlists',
          'vibo_get_section_songs',
          'vibo_healthcheck',
          'vibo_import_playlist_to_section',
          'vibo_invite_users',
          'vibo_join_event',
          'vibo_leave_event',
          'vibo_list_event_users',
          'vibo_list_events',
          'vibo_list_notifications',
          'vibo_list_section_questions',
          'vibo_list_section_song_ideas',
          'vibo_list_sections',
          'vibo_list_song_ideas_songs',
          'vibo_mark_notifications_read',
          'vibo_move_song',
          'vibo_remove_song_from_section',
          'vibo_remove_user',
          'vibo_reorder_songs',
          'vibo_search_songs',
          'vibo_set_profile_photo',
          'vibo_toggle_song_like',
          'vibo_update_section',
          'vibo_update_song',
        ].sort(),
      );
      // The reduced surface: browser-capture is excluded; uploads are included.
      expect(names).not.toContain('vibo_capture_session');
      expect(names).toContain('vibo_set_profile_photo');
      expect(names).toContain('vibo_answer_question');
      expect(names.length).toBe(38);
    } finally {
      await harness.close();
    }
  });
});
