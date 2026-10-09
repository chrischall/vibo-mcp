import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { McpToolError, minifiedResult, confirmTokenParam, toolAnnotations } from '@chrischall/mcp-utils';
import type { ViboClient } from '../client.js';
import { CREATE_SECTION, REMOVE_SECTION, REORDER_SECTIONS, UPDATE_SECTION } from '../gql.js';
import { planMoves, missingIds } from '../reorder.js';
import { confirmWrite, CONFIRM_NOTE } from './shared.js';
import {
  fetchSections,
  fetchEventPermissions,
  findSection,
  isHost,
  type EventPermissions,
  type SectionInfo,
} from './lookups.js';

/**
 * The web app's section-name limit (`nameMustBeCharactersOrLess`, count 45).
 * Vibo's API stores longer names (60 was accepted live), so this keeps names
 * the web UI can still edit.
 */
export const SECTION_NAME_MAX = 45;

/**
 * The web app's "Add section" defaults (its create-form initial values), so a
 * section made here behaves like one made in the UI.
 */
const DEFAULT_SECTION_SETTINGS = {
  timeEnabled: true,
  songsEnabled: true,
  notesEnabled: true,
  canHostsOrderSongs: true,
  canHostDeleteSection: true,
  notesVisibleForHosts: true,
  canHostChangeSectionName: true,
  canHostChangeSectionTime: true,
};

/** The UI's "Who will see this section" choices → settings, verbatim from its bundle. */
const VISIBILITY_SETTINGS = {
  host: { visibleForGuests: false, visibleForHosts: true }, // "Me and DJ"
  public: { visibleForGuests: true, visibleForHosts: true }, // "Guests"
} as const;

/** Section types a delete must be forced for: the DJ's built-in list and timeline dividers. */
const PROTECTED_TYPES = new Set(['dontPlay', 'headline']);

const TIME_PATTERN = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([ap])\.?m\.?$/i;

/** "5:00 PM" / "05:00pm" → "05:00 pm" (the form Vibo stores); undefined when not a 12-hour time. */
export function normalizeTime(time: string): string | undefined {
  const m = TIME_PATTERN.exec(time.trim());
  if (!m) return undefined;
  return `${m[1].padStart(2, '0')}:${m[2]} ${m[3].toLowerCase()}m`;
}

function assertCanWriteTimeline(perms: EventPermissions, flag: 'canHostCreateSections' | 'canHostReorderSections', what: string) {
  if (!isHost(perms)) return;
  if (perms.isLocked) {
    throw new McpToolError(`This event is locked, so hosts can't ${what}. Nothing was sent.`, {
      hint: 'The DJ locks an event close to the date; ask them to unlock it or make the change.',
    });
  }
  if (perms.settings?.[flag] === false) {
    throw new McpToolError(`The DJ has turned off "${flag}" for this event, so hosts can't ${what}. Nothing was sent.`, {
      hint: "It's an event setting only the DJ can change — ask them to enable it or make the change.",
    });
  }
}

const sectionLabel = (s: SectionInfo) => ({ _id: s._id, name: s.name });

export function registerSectionManageTools(server: McpServer, client: ViboClient): void {
  server.registerTool(
    'vibo_create_section',
    {
      description:
        `Create a new timeline section. Name is required, max ${SECTION_NAME_MAX} characters (Vibo's limit, checked ` +
        'before anything is sent). Place it with afterSectionId (directly after that section) or position ' +
        '(0-based index; 0 = first); with neither it goes at the end of the timeline, like the web app. ' +
        'visibility "host" (default) = "Me and DJ", "public" = visible to guests too. Vibo gives a section a host ' +
        "creates \"hosts can order songs\" = off, which only the DJ can turn on. Returns the new section _id. " +
        CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Create Vibo section', readOnly: false, destructive: false, idempotent: false }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        name: z.string().describe(`Section name, 1–${SECTION_NAME_MAX} characters.`),
        visibility: z
          .enum(['host', 'public'])
          .optional()
          .describe('"host" (default) = Me and DJ only; "public" = guests can see it too.'),
        time: z.string().optional().describe('Scheduled time as "hh:mm am/pm", e.g. "05:30 pm".'),
        note: z.string().optional().describe('Note to the DJ (set right after creating, via updateSection).'),
        afterSectionId: z.string().optional().describe('Put the new section directly after this section _id.'),
        position: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('0-based timeline index for the new section; past the end appends. Use instead of afterSectionId.'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, name, visibility, time, note, afterSectionId, position, confirmToken }, ctx) => {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new McpToolError('Section name is empty.', { hint: 'Pass a name of 1–45 characters.' });
      }
      if (trimmed.length > SECTION_NAME_MAX) {
        throw new McpToolError(
          `Section name is ${trimmed.length} characters; Vibo allows at most ${SECTION_NAME_MAX}. Nothing was sent.`,
          { hint: `Shorten the name to ${SECTION_NAME_MAX} characters or fewer.` },
        );
      }
      let normalizedTime: string | undefined;
      if (time !== undefined && time.trim() !== '') {
        normalizedTime = normalizeTime(time);
        if (!normalizedTime) {
          throw new McpToolError(`"${time}" is not a 12-hour time.`, { hint: 'Use "hh:mm am/pm", e.g. "05:30 pm".' });
        }
      }
      if (afterSectionId !== undefined && position !== undefined) {
        throw new McpToolError('Pass afterSectionId or position, not both.', {
          hint: 'afterSectionId places it after a named section; position places it at a 0-based index.',
        });
      }

      const [perms, sections] = await Promise.all([fetchEventPermissions(client, eventId), fetchSections(client, eventId)]);
      assertCanWriteTimeline(perms, 'canHostCreateSections', 'add sections');

      // Resolve placement to the one knob createSection has: insertBeforeSectionId.
      let insertBefore: SectionInfo | undefined;
      let placedAfter: SectionInfo | null; // null = start of the timeline
      if (afterSectionId !== undefined) {
        const anchor = findSection(sections, afterSectionId);
        insertBefore = sections[sections.indexOf(anchor) + 1];
        placedAfter = anchor;
      } else if (position !== undefined) {
        insertBefore = sections[position];
        placedAfter = position === 0 ? null : (sections[Math.min(position, sections.length) - 1] ?? null);
      } else {
        placedAfter = sections[sections.length - 1] ?? null;
      }

      const payload: Record<string, unknown> = {
        type: 'simple',
        name: trimmed,
        settings: {
          ...DEFAULT_SECTION_SETTINGS,
          ...(perms.settings?.sectionSongsLimit != null ? { songsLimit: perms.settings.sectionSongsLimit } : {}),
          ...(perms.settings?.sectionMustPlayLimit != null ? { mustPlayLimit: perms.settings.sectionMustPlayLimit } : {}),
          ...VISIBILITY_SETTINGS[visibility ?? 'host'],
        },
      };
      if (normalizedTime) payload.time = normalizedTime;
      if (insertBefore) payload.insertBeforeSectionId = insertBefore._id;

      const willSend: Record<string, unknown> = { eventId, payload };
      if (note !== undefined) willSend.thenUpdateSection = { payload: { note } };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_create_section',
        mutation: note !== undefined ? 'createSection, then updateSection (note)' : 'createSection',
        message: `Review and confirm creating section "${trimmed}":`,
        confirmToken,
        target: eventId,
        willSend,
        context: { placedAfter: placedAfter ? sectionLabel(placedAfter) : 'start of timeline' },
      });
      if (gate) return gate;

      const created = (await client.gql<{ createSection: Record<string, unknown> & { _id: string } }>(CREATE_SECTION, {
        eventId,
        payload,
      })).createSection;

      let noteResult: unknown;
      if (note !== undefined) {
        noteResult = (await client.gql<{ updateSection: { note?: string } }>(UPDATE_SECTION, {
          eventId,
          sectionId: created._id,
          payload: { note },
        })).updateSection?.note;
      }

      // Belt and braces: if Vibo ever ignores insertBeforeSectionId (it honoured
      // it live), move the section into place. A stale re-read that doesn't show
      // the new section yet is reported, not guessed at.
      let placement: 'as-requested' | 'fixed-by-reorder' | 'unverified' = 'unverified';
      const after = await fetchSections(client, eventId);
      const order = after.map((s) => s._id);
      if (order.includes(created._id) && (!placedAfter || order.includes(placedAfter._id))) {
        const { moves } = planMoves(order, [created._id], placedAfter?._id ?? null);
        for (const m of moves) {
          await client.gql(REORDER_SECTIONS, { eventId, sourceSectionId: m.source, targetSectionId: m.target });
        }
        placement = moves.length ? 'fixed-by-reorder' : 'as-requested';
      }

      return minifiedResult({
        ...created,
        ...(note !== undefined ? { note: noteResult ?? note } : {}),
        placedAfter: placedAfter ? sectionLabel(placedAfter) : null,
        placement,
      });
    },
  );

  server.registerTool(
    'vibo_delete_section',
    {
      description:
        'Delete a timeline section, with every song, answer and comment in it — this cannot be undone. The preview ' +
        'names the section and how many songs and answered questions it holds. Sections of type "dontPlay" (the ' +
        "DJ's do-not-play list) and \"headline\" (timeline dividers) are refused unless force:true. " +
        CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Delete Vibo section', readOnly: false, destructive: true }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section _id from vibo_list_sections.'),
        force: z.boolean().optional().describe('Required to delete a "dontPlay" or "headline" section.'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sectionId, force, confirmToken }, ctx) => {
      const section = findSection(await fetchSections(client, eventId), sectionId);
      if (PROTECTED_TYPES.has(section.type) && !force) {
        throw new McpToolError(
          `"${section.name}" is a ${section.type} section${section.type === 'dontPlay' ? " (the DJ's do-not-play list)" : ' (a timeline divider)'}; refusing to delete it. Nothing was sent.`,
          { hint: 'Pass force:true only if the user explicitly wants this section gone.' },
        );
      }
      if (section.canRemove === false) {
        throw new McpToolError(`Vibo reports you can't delete "${section.name}". Nothing was sent.`, {
          hint: 'The DJ controls who may delete each section ("Who can delete section"); ask them to allow it or delete it.',
        });
      }
      const summary = {
        name: section.name,
        type: section.type,
        songsCount: section.songsCount,
        questionsAnswered: `${section.answeredCount}/${section.questionsCount}`,
      };
      const vars = { eventId, sectionId };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_delete_section',
        mutation: 'removeSection',
        message:
          `Delete section "${section.name}"? It holds ${section.songsCount} song(s) and ` +
          `${section.answeredCount} of ${section.questionsCount} answered question(s). This cannot be undone.`,
        confirmToken,
        target: sectionId,
        willSend: vars,
        context: summary,
      });
      if (gate) return gate;
      const data = await client.gql<{ removeSection: boolean }>(REMOVE_SECTION, vars);
      if (data.removeSection !== true) {
        throw new McpToolError(`Vibo did not confirm deleting "${section.name}" (removeSection returned ${String(data.removeSection)}).`, {
          hint: 'Re-check with vibo_list_sections before retrying.',
        });
      }
      return minifiedResult({ deleted: true, section: { _id: sectionId, ...summary } });
    },
  );

  server.registerTool(
    'vibo_reorder_sections',
    {
      description:
        'Move one or more timeline sections to directly after targetSectionId (omit it to move them to the start), ' +
        'keeping the given order. Mirrors vibo_reorder_songs. Sends one reorderSections call per section that ' +
        'actually moves. ' +
        CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Reorder Vibo sections', readOnly: false, destructive: false }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        sourceSectionIds: z.array(z.string()).min(1).describe('Section _ids to move, in the order they should end up.'),
        targetSectionId: z.string().optional().describe('Place the moved sections right after this section _id; omit for the start.'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sourceSectionIds, targetSectionId, confirmToken }, ctx) => {
      if (new Set(sourceSectionIds).size !== sourceSectionIds.length) {
        throw new McpToolError('sourceSectionIds contains a duplicate.', { hint: 'List each section once.' });
      }
      if (targetSectionId !== undefined && sourceSectionIds.includes(targetSectionId)) {
        throw new McpToolError('targetSectionId is also one of the sections being moved.', {
          hint: 'Pick a target outside sourceSectionIds (the moved sections keep their given order).',
        });
      }
      const [perms, sections] = await Promise.all([fetchEventPermissions(client, eventId), fetchSections(client, eventId)]);
      const order = sections.map((s) => s._id);
      const missing = missingIds([...sourceSectionIds, ...(targetSectionId ? [targetSectionId] : [])], order);
      if (missing.length) {
        throw new McpToolError(`Not in this event's timeline: ${missing.join(', ')}. Nothing was sent.`, {
          hint: 'Get section ids from vibo_list_sections for the same eventId.',
        });
      }
      assertCanWriteTimeline(perms, 'canHostReorderSections', 'reorder sections');

      const byId = new Map(sections.map((s) => [s._id, s]));
      const { moves, finalOrder } = planMoves(order, sourceSectionIds, targetSectionId ?? null);
      const after = targetSectionId ? sectionLabel(byId.get(targetSectionId)!) : 'start of timeline';
      if (moves.length === 0) {
        return minifiedResult({ changed: false, message: 'Those sections are already in that order.', after });
      }
      const calls = moves.map((m) => ({ sourceSectionId: m.source, targetSectionId: m.target }));
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_reorder_sections',
        mutation: 'reorderSections',
        message: `Review and confirm moving ${sourceSectionIds.length} section(s):`,
        confirmToken,
        target: eventId,
        willSend: { eventId, calls },
        context: { moving: sourceSectionIds.map((id) => byId.get(id)!.name), after },
      });
      if (gate) return gate;
      for (const c of calls) {
        await client.gql(REORDER_SECTIONS, { eventId, ...c });
      }
      return minifiedResult({
        changed: true,
        callsSent: calls.length,
        after,
        newPositions: sourceSectionIds.map((id) => ({ ...sectionLabel(byId.get(id)!), index: finalOrder.indexOf(id) })),
      });
    },
  );
}
