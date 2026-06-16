import { describe, it, expect, afterAll } from 'vitest';
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
import { createTestHarness } from './helpers.js';

describe('tool registry', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;
  afterAll(async () => { if (harness) await harness.close(); });

  it('registers exactly the expected 38 tools', async () => {
    harness = await createTestHarness((server) => {
      registerProfileTools(server);
      registerEventTools(server);
      registerSectionTools(server);
      registerSongTools(server);
      registerPlaylistTools(server);
      registerNotificationTools(server);
      registerQuestionTools(server);
      registerSongManagementTools(server);
      registerCommentTools(server);
      registerIdeasTools(server);
      registerImportTools(server);
      registerCollaborationTools(server);
      registerSectionEditTools(server);
      registerUploadTools(server);
    });

    const names = (await harness.listTools()).map((t) => t.name).sort();
    const expected = [
      'vibo_add_song_to_section',
      'vibo_create_event_contact',
      'vibo_export_event_to_apple_music',
      'vibo_export_event_to_spotify',
      'vibo_get_event',
      'vibo_get_me',
      'vibo_get_notifications_count',
      'vibo_get_playlist_songs',
      'vibo_get_playlists',
      'vibo_get_section_songs',
      'vibo_healthcheck',
      'vibo_join_event',
      'vibo_leave_event',
      'vibo_list_events',
      'vibo_list_notifications',
      'vibo_list_section_questions',
      'vibo_list_sections',
      'vibo_mark_notifications_read',
      'vibo_answer_question',
      'vibo_search_songs',
      'vibo_toggle_song_like',
      // v2 — song management
      'vibo_remove_song_from_section',
      'vibo_update_song',
      'vibo_move_song',
      'vibo_reorder_songs',
      // v2 — comments
      'vibo_comment_on_song',
      'vibo_delete_song_comment',
      'vibo_comment_on_section',
      'vibo_delete_section_comment',
      // v2 — song ideas
      'vibo_list_section_song_ideas',
      'vibo_list_song_ideas_songs',
      // v2 — playlist import
      'vibo_import_playlist_to_section',
      // v3 — collaboration
      'vibo_list_event_users',
      'vibo_invite_users',
      'vibo_change_user_role',
      'vibo_remove_user',
      // v3 — section editing
      'vibo_update_section',
      // uploads
      'vibo_set_profile_photo',
    ].sort();

    expect(names).toEqual(expected);
  });

  it('marks every mutating tool as not read-only and gives reads a read-only hint', async () => {
    // Use the underlying SDK client for full tool descriptors (the harness's
    // listTools() convenience returns names only).
    const { tools } = await harness.client.listTools();
    const writeTools = new Set([
      'vibo_add_song_to_section',
      'vibo_toggle_song_like',
      'vibo_join_event',
      'vibo_leave_event',
      'vibo_create_event_contact',
      'vibo_mark_notifications_read',
      'vibo_export_event_to_spotify',
      'vibo_export_event_to_apple_music',
      'vibo_answer_question',
      'vibo_remove_song_from_section',
      'vibo_update_song',
      'vibo_move_song',
      'vibo_reorder_songs',
      'vibo_comment_on_song',
      'vibo_delete_song_comment',
      'vibo_comment_on_section',
      'vibo_delete_section_comment',
      'vibo_import_playlist_to_section',
      'vibo_invite_users',
      'vibo_change_user_role',
      'vibo_remove_user',
      'vibo_update_section',
      'vibo_set_profile_photo',
    ]);
    for (const t of tools) {
      const readOnly = t.annotations?.readOnlyHint;
      if (writeTools.has(t.name)) expect(readOnly, t.name).toBe(false);
      else expect(readOnly, t.name).toBe(true);
    }
  });
});
