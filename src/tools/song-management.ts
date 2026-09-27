import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { McpToolError, minifiedResult, confirmTokenParam, toolAnnotations } from '@chrischall/mcp-utils';
import type { ViboClient } from '../client.js';
import { REMOVE_SECTION_SONGS, UPDATE_SECTION_SONGS, MOVE_SECTION_SONGS, REORDER_SONGS } from '../gql.js';
import { planMoves } from '../reorder.js';
import { confirmWrite, CONFIRM_NOTE } from './shared.js';
import {
  fetchSections,
  fetchEventPermissions,
  fetchSectionSongs,
  findSection,
  assertSongsInSection,
  isHost,
} from './lookups.js';

/**
 * Vibo's song-comment limit, measured live: 90 is stored, 91 is refused with
 * "Comment should be less then 90 characters". Counted in UTF-16 units (an
 * emoji is 2), which is what String#length gives.
 */
export const SONG_COMMENT_MAX = 90;

export function registerSongManagementTools(server: McpServer, client: ViboClient): void {
  server.registerTool(
    'vibo_remove_song_from_section',
    {
      description:
        'Remove one or more songs from a section. Every id is checked against the section first; if any is not ' +
        'there, nothing is sent and the missing ids are listed. ' + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Remove songs from Vibo section', readOnly: false, destructive: true }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id.'),
        songIds: z
          .array(z.string())
          .min(1)
          .describe('Song _ids from vibo_get_section_songs.'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sectionId, songIds, confirmToken }, ctx) => {
      // Vibo answers success:true for ids that aren't in the section and removes
      // nothing, so check them ourselves before asking the user to confirm.
      const songs = await fetchSectionSongs(client, eventId, sectionId);
      assertSongsInSection(songIds, songs);
      const vars = { eventId, sectionId, songIds };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_remove_song_from_section',
        mutation: 'removeSectionSongsV2',
        message: 'Review and confirm removing these songs:',
        confirmToken,
        target: sectionId,
        willSend: vars,
        context: {
          songs: songIds.map((id) => {
            const s = songs.find((x) => x._id === id)!;
            return `${s.title ?? '?'} — ${s.artist ?? '?'}`;
          }),
        },
      });
      if (gate) return gate;
      const data = await client.gql<{ removeSectionSongsV2: unknown }>(REMOVE_SECTION_SONGS, vars);
      return minifiedResult(data.removeSectionSongsV2);
    },
  );

  server.registerTool(
    'vibo_update_song',
    {
      description:
        'Update songs in a section: mark must-play, flag as do-not-play, and/or set a comment. Provide at least one field. ' +
        `A comment can be at most ${SONG_COMMENT_MAX} characters (Vibo's limit; emoji count double; checked before anything is sent). ` +
        CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Update Vibo section songs', readOnly: false, destructive: false }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id.'),
        songIds: z
          .array(z.string())
          .min(1)
          .describe('Song _ids from vibo_get_section_songs.'),
        isMustPlay: z.boolean().optional(),
        isFlagged: z.boolean().optional().describe('mark do-not-play / flagged'),
        comment: z.string().optional().describe(`Comment for the DJ, at most ${SONG_COMMENT_MAX} characters.`),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sectionId, songIds, isMustPlay, isFlagged, comment, confirmToken }, ctx) => {
      const payload: Record<string, unknown> = {};
      if (isMustPlay !== undefined) payload.isMustPlay = isMustPlay;
      if (isFlagged !== undefined) payload.isFlagged = isFlagged;
      if (comment !== undefined) payload.comment = comment;
      if (Object.keys(payload).length === 0) {
        throw new McpToolError('Provide at least one of isMustPlay, isFlagged, or comment.', {
          hint: 'Pass isMustPlay, isFlagged, and/or comment to update the songs.',
        });
      }
      if (comment !== undefined && comment.length > SONG_COMMENT_MAX) {
        throw new McpToolError(
          `Comment is ${comment.length} characters; Vibo allows at most ${SONG_COMMENT_MAX}. Nothing was sent.`,
          { hint: `Shorten it to ${SONG_COMMENT_MAX} characters or fewer, or put the longer text in a section note.` },
        );
      }
      const vars = { eventId, sectionId, songIds, payload };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_update_song',
        mutation: 'updateSectionSongs',
        message: 'Review and confirm this song update:',
        confirmToken,
        target: sectionId,
        willSend: vars,
      });
      if (gate) return gate;
      const data = await client.gql<{ updateSectionSongs: unknown }>(UPDATE_SECTION_SONGS, vars);
      return minifiedResult(data.updateSectionSongs);
    },
  );

  server.registerTool(
    'vibo_move_song',
    {
      description: 'Move songs from one section to another. ' + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Move Vibo section songs', readOnly: false, destructive: false }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        sourceSectionId: z.string().describe('Section id the songs are currently in.'),
        targetSectionId: z.string().describe('Section id to move the songs to.'),
        songIds: z
          .array(z.string())
          .min(1)
          .describe('Song _ids from vibo_get_section_songs.'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sourceSectionId, targetSectionId, songIds, confirmToken }, ctx) => {
      const vars = { eventId, sourceSectionId, targetSectionId, songIds };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_move_song',
        mutation: 'moveSectionSongsV2',
        message: 'Review and confirm moving these songs:',
        confirmToken,
        target: sourceSectionId,
        willSend: vars,
      });
      if (gate) return gate;
      const data = await client.gql<{ moveSectionSongsV2: unknown }>(MOVE_SECTION_SONGS, vars);
      return minifiedResult(data.moveSectionSongsV2);
    },
  );

  server.registerTool(
    'vibo_reorder_songs',
    {
      description:
        'Reorder songs within a section: move sourceSongIds (in the given order) to directly after targetSongId, ' +
        'or to the top when it is omitted. Checks the ids against the section and, for a host, that the DJ allows ' +
        "hosts to order this section's songs. That setting is OFF for every section a host creates and only the " +
        'DJ can turn it on, so a host usually cannot reorder songs in sections they added. Sends one ' +
        'reorderSongsBatch call per song that actually moves. ' +
        CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Reorder Vibo section songs', readOnly: false, destructive: false }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id.'),
        sourceSongIds: z
          .array(z.string())
          .min(1)
          .describe('Song _ids from vibo_get_section_songs, in the order they should end up.'),
        targetSongId: z
          .string()
          .optional()
          .describe('place the moved songs directly after this song _id; omit for the top'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sectionId, sourceSongIds, targetSongId, confirmToken }, ctx) => {
      if (new Set(sourceSongIds).size !== sourceSongIds.length) {
        throw new McpToolError('sourceSongIds contains a duplicate.', { hint: 'List each song once.' });
      }
      if (targetSongId !== undefined && sourceSongIds.includes(targetSongId)) {
        throw new McpToolError('targetSongId is also one of the songs being moved.', {
          hint: 'Pick a target outside sourceSongIds.',
        });
      }
      const [perms, sections, songs] = await Promise.all([
        fetchEventPermissions(client, eventId),
        fetchSections(client, eventId),
        fetchSectionSongs(client, eventId, sectionId),
      ]);
      const section = findSection(sections, sectionId);
      // Vibo refuses a host's reorder with "Action is not allowed for user" when
      // the section's "hosts can order songs" is off — which it is for every
      // section a host creates (measured live; a host's attempt to turn it on
      // is accepted and ignored). The web app hides drag handles there too.
      if (isHost(perms) && section.settings?.canHostsOrderSongs === false) {
        throw new McpToolError(
          `The DJ has turned off host song ordering for "${section.name}", so Vibo refuses reorders from hosts there. Nothing was sent.`,
          {
            hint:
              "It's the section's canHostsOrderSongs setting. Vibo turns it off for sections a host creates, and only the DJ " +
              'can turn it on (a host update is ignored). Ask the DJ, or leave a comment on the song instead.',
          },
        );
      }
      assertSongsInSection([...sourceSongIds, ...(targetSongId ? [targetSongId] : [])], songs);

      const { moves } = planMoves(songs.map((s) => s._id), sourceSongIds, targetSongId ?? null);
      if (moves.length === 0) {
        return minifiedResult({ changed: false, message: 'Those songs are already in that order.' });
      }
      const calls = moves.map((m) => ({ sourceSongIds: [m.source], targetSongId: m.target }));
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_reorder_songs',
        mutation: 'reorderSongsBatch',
        message: 'Review and confirm this reorder:',
        confirmToken,
        target: sectionId,
        willSend: { eventId, sectionId, calls },
      });
      if (gate) return gate;
      for (const c of calls) {
        await client.gql<{ reorderSongsBatch: unknown }>(REORDER_SONGS, { eventId, sectionId, ...c });
      }
      return minifiedResult({ changed: true, callsSent: calls.length });
    },
  );
}
