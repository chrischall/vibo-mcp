import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerImportTools } from '../../src/tools/imports.js';
import { IMPORT_PLAYLIST_TO_SECTION } from '../../src/gql.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('import tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerImportTools(s));
  });

  it('vibo_import_playlist_to_section previews without calling gql', async () => {
    const preview = await harness.callTool('vibo_import_playlist_to_section', {
      eventId: 'e1',
      sectionId: 's1',
      source: 'spotify',
      playlistId: 'p1',
      tracksToAdd: ['t1', 't2'],
    });
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ preview: boolean }>(preview).preview).toBe(true);
  });

  it('vibo_import_playlist_to_section imports with confirm', async () => {
    gql.mockResolvedValue({ importPlaylistToSectionWeb: { added: 2, existing: 0, ignored: 0 } });
    await harness.callTool('vibo_import_playlist_to_section', {
      eventId: 'e1',
      sectionId: 's1',
      source: 'spotify',
      playlistId: 'p1',
      tracksToAdd: ['t1', 't2'],
      confirm: true,
    });
    expect(gql).toHaveBeenCalledWith(IMPORT_PLAYLIST_TO_SECTION, {
      eventId: 'e1',
      sectionId: 's1',
      playlistId: 'p1',
      source: 'spotify',
      tracksToAdd: ['t1', 't2'],
      tracksToIgnore: [],
    });
  });
});
