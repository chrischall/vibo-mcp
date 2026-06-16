#!/usr/bin/env node
import { runMcp } from '@chrischall/mcp-utils';
import { VERSION } from './version.js';
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

// The ViboClient is a module-level singleton (constructed in client.ts and
// imported by each tool module) that defers its config error to the first
// request. That preserves the deferred-config-error pattern: the server boots
// and answers the host's install-time tools/list probe even when no Vibo
// credentials are set — the error only surfaces on the first tool call.
await runMcp({
  name: 'vibo-mcp',
  version: VERSION,
  banner:
    '[vibo-mcp] This project was developed and is maintained by AI (Claude Code). Use at your own discretion.',
  tools: [
    registerProfileTools,
    registerEventTools,
    registerSectionTools,
    registerSongTools,
    registerPlaylistTools,
    registerNotificationTools,
    registerQuestionTools,
    registerSongManagementTools,
    registerCommentTools,
    registerIdeasTools,
    registerImportTools,
    registerCollaborationTools,
    registerSectionEditTools,
    registerUploadTools,
  ],
});
