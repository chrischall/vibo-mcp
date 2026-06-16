import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerIdeasTools } from '../../src/tools/ideas.js';
import { LIST_SECTION_SONG_IDEAS, LIST_SONG_IDEAS_SONGS } from '../../src/gql.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('ideas tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerIdeasTools(s));
  });

  it('vibo_list_section_song_ideas passes pagination and unwraps the payload', async () => {
    gql.mockResolvedValue({ getEventSectionSongIdeas: { songIdeas: [], totalCount: 0 } });
    const res = await harness.callTool('vibo_list_section_song_ideas', {
      eventId: 'e1',
      sectionId: 's1',
      limit: 10,
    });
    expect(gql).toHaveBeenCalledWith(LIST_SECTION_SONG_IDEAS, {
      eventId: 'e1',
      sectionId: 's1',
      pagination: { skip: 0, limit: 10 },
    });
    expect(parseToolResult<{ totalCount: number }>(res).totalCount).toBe(0);
  });

  it('vibo_list_song_ideas_songs passes songIdeasId + pagination and unwraps the payload', async () => {
    gql.mockResolvedValue({ getEventSectionSongIdeasSongs: { songs: [], totalCount: 0 } });
    const res = await harness.callTool('vibo_list_song_ideas_songs', {
      eventId: 'e1',
      sectionId: 's1',
      songIdeasId: 'si1',
      skip: 5,
    });
    expect(gql).toHaveBeenCalledWith(LIST_SONG_IDEAS_SONGS, {
      eventId: 'e1',
      sectionId: 's1',
      songIdeasId: 'si1',
      pagination: { skip: 5, limit: 20 },
    });
    expect(parseToolResult<{ totalCount: number }>(res).totalCount).toBe(0);
  });
});
