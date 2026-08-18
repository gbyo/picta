/** `.picta` v2 parsing, serialization and in-memory v1 migration. */

import type { MediaItem, MediaResource, ShowDocument, Team, TeamResource } from './domain.js';
import { defaultMediaSet } from './media.js';
import { legacyLayoutToTree, validateLayout } from './layouts.js';
import { parseMediaSet, resolveMediaSetPaths, serializeMediaSet } from './media-set-file.js';
import { resolveStoredPath, storedPathFor, type PathStyle } from './paths.js';
import { parseTeam, resolveTeamPaths, serializeTeam, TEAM_FORMAT_VERSION } from './team-file.js';
import type { ParsedPicta } from './picta-file.js';

export const PICTA_V2_FORMAT_VERSION = 2;
export const PICTA_V2_MAX_SUPPORTED_VERSION = 2;

export type ShowParseErrorKind =
  | 'invalid-json'
  | 'not-an-object'
  | 'missing-version'
  | 'unsupported-version'
  | 'invalid-media'
  | 'invalid-team'
  | 'invalid-event'
  | 'invalid-layout'
  | 'invalid-field';

export type ShowParseResult =
  { ok: true; value: ShowDocument } | { ok: false; kind: ShowParseErrorKind; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(kind: ShowParseErrorKind, message: string): ShowParseResult {
  return { ok: false, kind, message };
}

function validPath(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !value.includes('\0');
}

function hasExtension(path: string, extension: string): boolean {
  return path.toLowerCase().endsWith(`.${extension}`);
}

function parseMediaResource(value: unknown): MediaResource | string {
  if (!isObject(value) || (value['kind'] !== 'inline' && value['kind'] !== 'file'))
    return 'The show has an invalid media resource.';
  if (value['kind'] === 'file') {
    if (!validPath(value['path']) || !hasExtension(value['path'], 'pictaset'))
      return 'The show has an invalid media-set path.';
    if (value['data'] !== undefined) {
      const parsed = parseMediaSet(JSON.stringify(value['data']));
      if (!parsed.ok) return parsed.message;
      return { kind: 'file', path: value['path'], data: parsed.value };
    }
    return { kind: 'file', path: value['path'] };
  }
  const parsed = parseMediaSet(JSON.stringify(value['data']));
  if (!parsed.ok) return parsed.message;
  return { kind: 'inline', data: parsed.value };
}

function parseTeamResource(value: unknown): TeamResource | string {
  if (!isObject(value) || (value['kind'] !== 'inline' && value['kind'] !== 'file'))
    return 'The show has an invalid team resource.';
  if (value['kind'] === 'file') {
    if (!validPath(value['path']) || !hasExtension(value['path'], 'pictateam'))
      return 'The show has an invalid team path.';
    if (value['data'] !== undefined) {
      const parsed = parseTeam(JSON.stringify(value['data']));
      if (!parsed.ok) return parsed.message;
      return { kind: 'file', path: value['path'], data: parsed.value };
    }
    return { kind: 'file', path: value['path'] };
  }
  const parsed = parseTeam(JSON.stringify(value['data']));
  if (!parsed.ok) return parsed.message;
  return { kind: 'inline', data: parsed.value };
}

function parseEvent(value: unknown): ShowDocument['event'] | string {
  if (!isObject(value)) return 'The show has invalid event state.';
  const rawStats = value['stats'] ?? {};
  const rawGroups = value['liveGroups'] ?? {};
  if (!isObject(rawStats) || !isObject(rawGroups)) return 'The show has invalid event state.';
  const stats: Record<string, Record<string, number>> = {};
  for (const [playerId, rawPlayerStats] of Object.entries(rawStats)) {
    if (!validPath(playerId) || !isObject(rawPlayerStats))
      return 'The show has invalid player statistics.';
    const counters: Record<string, number> = {};
    for (const [statId, rawValue] of Object.entries(rawPlayerStats)) {
      if (
        !validPath(statId) ||
        typeof rawValue !== 'number' ||
        !Number.isInteger(rawValue) ||
        rawValue < 0
      )
        return 'The show has invalid player statistics.';
      counters[statId] = rawValue;
    }
    stats[playerId] = counters;
  }
  const liveGroups: Record<string, string[]> = {};
  for (const [groupId, rawIds] of Object.entries(rawGroups)) {
    if (!validPath(groupId) || !Array.isArray(rawIds) || rawIds.some((id) => !validPath(id)))
      return 'The show has invalid live group state.';
    liveGroups[groupId] = [...new Set(rawIds.map((id) => String(id)))];
  }
  return { stats, liveGroups };
}

export function validateShowEventReferences(
  event: ShowDocument['event'],
  team: Team | undefined,
): string | null {
  if (!team) return null;
  const playerIds = new Set(team.players.map((player) => player.id));
  for (const playerId of Object.keys(event.stats)) {
    if (!playerIds.has(playerId)) return `Event statistics reference missing player "${playerId}".`;
  }
  for (const [groupId, ids] of Object.entries(event.liveGroups)) {
    const group = team.groups.find((item) => item.id === groupId);
    if (!group) return `Live group state references missing group "${groupId}".`;
    if (ids.some((playerId) => !playerIds.has(playerId))) {
      return `Live group "${groupId}" references a missing player.`;
    }
    if (group.maxPlayers !== undefined && ids.length > group.maxPlayers) {
      return `Live group "${groupId}" exceeds its maximum player count.`;
    }
  }
  return null;
}

export function parsePictaV2(text: string): ShowParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('invalid-json', 'This show file is not valid JSON.');
  }
  if (!isObject(raw)) return fail('not-an-object', 'This does not look like a Picta show.');
  const version = raw['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return fail('missing-version', 'This show has no valid version.');
  if (version > PICTA_V2_MAX_SUPPORTED_VERSION)
    return fail(
      'unsupported-version',
      `This show uses version ${version}. Update Picta to open it.`,
    );
  if (version !== PICTA_V2_FORMAT_VERSION)
    return fail(
      'unsupported-version',
      `This parser expects Picta show version ${PICTA_V2_FORMAT_VERSION}.`,
    );
  const media = parseMediaResource(raw['media']);
  if (typeof media === 'string') return fail('invalid-media', media);
  const team = raw['team'] === undefined ? undefined : parseTeamResource(raw['team']);
  if (typeof team === 'string') return fail('invalid-team', team);
  const event = parseEvent(raw['event'] ?? {});
  if (typeof event === 'string') return fail('invalid-event', event);
  const referenceError = validateShowEventReferences(event, team?.data);
  if (referenceError) return fail('invalid-event', referenceError);
  const layoutCheck = validateLayout(raw['layout']);
  if (!layoutCheck.ok) return fail('invalid-layout', layoutCheck.message);
  const layout = raw['layout'];
  const background = raw['background'] ?? { kind: 'black' };
  if (
    !isObject(background) ||
    !['black', 'primary', 'secondary'].includes(String(background['kind']))
  )
    return fail('invalid-field', 'The show has an invalid background.');
  const groupId = raw['liveBoardGroupId'];
  if (groupId !== undefined && !validPath(groupId))
    return fail('invalid-field', 'The show has an invalid live-board group id.');
  if (
    groupId !== undefined &&
    team?.data &&
    !team.data.groups.some((group) => group.id === groupId)
  )
    return fail('invalid-field', 'The show references a missing live-board group.');
  return {
    ok: true,
    value: {
      version: 2,
      media,
      ...(team === undefined ? {} : { team }),
      event,
      layout: layout as ShowDocument['layout'],
      ...(groupId === undefined ? {} : { liveBoardGroupId: groupId }),
      background: { kind: background['kind'] as 'black' | 'primary' | 'secondary' },
    },
  };
}

function serializeInlineMedia(
  set: import('./domain.js').MediaSet,
  filePath: string,
  style: PathStyle,
): Record<string, unknown> {
  return JSON.parse(serializeMediaSet(set, filePath, style)) as Record<string, unknown>;
}

function serializeMediaResource(
  resource: MediaResource,
  filePath: string,
  style: PathStyle,
): Record<string, unknown> {
  return resource.kind === 'inline'
    ? { kind: 'inline', data: serializeInlineMedia(resource.data, filePath, style) }
    : { kind: 'file', path: storedPathFor(resource.path, filePath, style) };
}

function serializeTeamResource(
  resource: TeamResource,
  filePath: string,
  style: PathStyle,
): Record<string, unknown> {
  return resource.kind === 'inline'
    ? {
        kind: 'inline',
        data: JSON.parse(serializeTeam(resource.data, filePath, style)) as Record<string, unknown>,
      }
    : { kind: 'file', path: storedPathFor(resource.path, filePath, style) };
}

export function serializePictaV2(show: ShowDocument, filePath: string, style: PathStyle): string {
  const body: Record<string, unknown> = {
    version: PICTA_V2_FORMAT_VERSION,
    media: serializeMediaResource(show.media, filePath, style),
    ...(show.team === undefined ? {} : { team: serializeTeamResource(show.team, filePath, style) }),
    event: {
      stats: show.event.stats,
      liveGroups: show.event.liveGroups,
    },
    layout: show.layout,
    ...(show.liveBoardGroupId === undefined ? {} : { liveBoardGroupId: show.liveBoardGroupId }),
    background: show.background,
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

export function resolveShowPaths(
  show: ShowDocument,
  filePath: string,
  style: PathStyle,
): ShowDocument {
  const resolveMedia = (resource: MediaResource): MediaResource =>
    resource.kind === 'inline'
      ? { kind: 'inline', data: resolveMediaSetPaths(resource.data, filePath, style) }
      : {
          kind: 'file',
          path: resolveStoredPath(resource.path, filePath, style),
          ...(resource.data ? { data: resolveMediaSetPaths(resource.data, filePath, style) } : {}),
        };
  const resolveTeam = (resource: TeamResource): TeamResource =>
    resource.kind === 'inline'
      ? { kind: 'inline', data: resolveTeamPaths(resource.data, filePath, style) }
      : {
          kind: 'file',
          path: resolveStoredPath(resource.path, filePath, style),
          ...(resource.data ? { data: resolveTeamPaths(resource.data, filePath, style) } : {}),
        };
  return {
    ...show,
    media: resolveMedia(show.media),
    ...(show.team === undefined ? {} : { team: resolveTeam(show.team) }),
  };
}

/** Convert a real v1 parse result without rewriting the source file. */
export function migratePictaV1(parsed: ParsedPicta): ShowDocument {
  const media = defaultMediaSet('Inline Media');
  media.imageDurationSeconds = parsed.intervalSeconds;
  media.transition = parsed.transition;
  media.imageSizing = parsed.imageSizing;
  media.items = parsed.storedPaths.map<MediaItem>((path, index) => ({
    id: `media-v1-${index + 1}`,
    type: 'image',
    path,
  }));
  let team: Team | undefined;
  const stats: Record<string, Record<string, number>> = {};
  const liveIds: string[] = [];
  if (parsed.roster.length > 0) {
    const players = parsed.roster.map((player, index) => {
      const id = `player-v1-${index + 1}`;
      stats[id] = {
        kills: player.stats.kills,
        assists: player.stats.assists,
        digs: player.stats.digs,
        blockSolos: player.stats.blocks,
      };
      if (player.onCourt) liveIds.push(id);
      return {
        id,
        number: player.number,
        name: player.name,
        ...(player.position ? { position: player.position } : {}),
        media: {},
      };
    });
    team = {
      version: TEAM_FORMAT_VERSION,
      id: 'team-v1-inline',
      name: 'Imported Team',
      sport: 'volleyball',
      colors: { primary: '#111111', secondary: '#ffffff' },
      players,
      groups: [
        {
          id: 'starting-lineup',
          name: 'Starting Lineup',
          playerIds: players.map((player) => player.id),
        },
        { id: 'on-court', name: 'On Court', playerIds: liveIds },
      ],
    };
  }
  return {
    version: 2,
    media: { kind: 'inline', data: media },
    ...(team === undefined ? {} : { team: { kind: 'inline', data: team } }),
    event: { stats, liveGroups: liveIds.length > 0 ? { 'on-court': liveIds } : {} },
    layout: legacyLayoutToTree(parsed.layout),
    ...(team === undefined ? {} : { liveBoardGroupId: 'on-court' }),
    background: { kind: 'black' },
  };
}
