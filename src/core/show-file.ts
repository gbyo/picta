/** `.picta` v3 parsing, serialization and in-memory legacy migration. */

import type {
  LayoutNode,
  MediaItem,
  MediaResource,
  Scene,
  Screen,
  ShowDocument,
  Team,
  TeamResource,
  VolleyballScoreState,
} from './domain.js';
import { defaultMediaSet } from './media.js';
import { legacyLayoutToTree } from './layouts.js';
import { parseMediaSet, resolveMediaSetPaths, serializeMediaSet } from './media-set-file.js';
import { resolveStoredPath, storedPathFor, type PathStyle } from './paths.js';
import { validateScenes } from './scenes.js';
import { defaultVolleyballScore } from './score.js';
import { defaultVolleyballScreens, flattenLegacyLayout, validateScreens } from './screens.js';
import { parseTeam, resolveTeamPaths, serializeTeam, TEAM_FORMAT_VERSION } from './team-file.js';
import type { ParsedPicta } from './picta-file.js';

export const PICTA_V2_FORMAT_VERSION = 2;
export const PICTA_V3_FORMAT_VERSION = 3;
export const PICTA_V2_MAX_SUPPORTED_VERSION = 3;
export const PICTA_FORMAT_VERSION = PICTA_V3_FORMAT_VERSION;
export const PICTA_MAX_SUPPORTED_VERSION = PICTA_V3_FORMAT_VERSION;

export type ShowParseErrorKind =
  | 'invalid-json'
  | 'not-an-object'
  | 'missing-version'
  | 'unsupported-version'
  | 'invalid-media'
  | 'invalid-team'
  | 'invalid-event'
  | 'invalid-scenes'
  | 'invalid-screens'
  | 'invalid-score'
  | 'invalid-field';

export type ShowParseResult =
  { ok: true; value: ShowDocument } | { ok: false; kind: ShowParseErrorKind; message: string };

export interface LegacyShowDocumentV2 {
  version: 2;
  media: MediaResource;
  team?: TeamResource;
  event: { stats: Record<string, Record<string, number>>; liveGroups: Record<string, string[]> };
  scenes: Scene[];
  defaultSceneId: string;
}

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

function parseScore(value: unknown, team?: Team): VolleyballScoreState | string {
  if (value === undefined) return defaultVolleyballScore(team);
  if (!isObject(value) || value['sport'] !== 'volleyball')
    return 'The show has invalid score state.';
  const side = (raw: unknown): raw is { name: string; primaryColor: string } =>
    isObject(raw) && validPath(raw['name']) && typeof raw['primaryColor'] === 'string';
  if (!side(value['home']) || !side(value['away'])) return 'The show has invalid score teams.';
  const whole = (raw: unknown, minimum: number) =>
    typeof raw === 'number' && Number.isInteger(raw) && raw >= minimum;
  if (
    !whole(value['homePoints'], 0) ||
    !whole(value['awayPoints'], 0) ||
    !whole(value['homeSets'], 0) ||
    !whole(value['awaySets'], 0) ||
    !whole(value['setNumber'], 1) ||
    ![null, 'home', 'away'].includes(value['serving'] as null | string) ||
    !['best-of-3', 'best-of-5'].includes(String(value['matchFormat']))
  )
    return 'The show has invalid score state.';
  return {
    sport: 'volleyball',
    home: { name: value['home'].name.trim(), primaryColor: value['home'].primaryColor },
    away: { name: value['away'].name.trim(), primaryColor: value['away'].primaryColor },
    homePoints: value['homePoints'] as number,
    awayPoints: value['awayPoints'] as number,
    homeSets: value['homeSets'] as number,
    awaySets: value['awaySets'] as number,
    setNumber: value['setNumber'] as number,
    serving: value['serving'] as 'home' | 'away' | null,
    matchFormat: value['matchFormat'] as 'best-of-3' | 'best-of-5',
  };
}

function parseEvent(value: unknown, team?: Team): ShowDocument['event'] | string {
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
  const score = parseScore(value['score'], team);
  if (typeof score === 'string') return score;
  return { stats, liveGroups, score };
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

function screenContentRole(
  kind: Screen['panels'][number]['content']['kind'],
): 'program' | 'live-board' | 'media' | 'blank' {
  if (kind === 'score' || kind === 'stats') return 'live-board';
  return kind === 'media' ? 'program' : 'blank';
}

/**
 * Temporary projection for the pre-v3 controller editor. The v3 file and
 * presentation renderer use Screens directly; this is not serialized.
 */
function legacySceneForScreen(screen: Screen): Scene {
  const zones = screen.panels.map((item) => ({
    type: 'zone' as const,
    id: item.id,
    role: screenContentRole(item.content.kind),
  }));
  let layout: LayoutNode = zones[0] ?? { type: 'zone', id: 'blank', role: 'blank' };
  if (zones.length === 2) {
    const [first, second] = screen.panels;
    const horizontal = Boolean(
      first && second && first.rect.height === 1 && second.rect.height === 1,
    );
    layout = {
      type: 'split',
      direction: horizontal ? 'columns' : 'rows',
      ratio: horizontal ? first!.rect.width : first!.rect.height,
      first: zones[0]!,
      second: zones[1]!,
    };
  }
  const stats = screen.panels.find((item) => item.content.kind === 'stats');
  return {
    id: screen.id,
    name: screen.name,
    layout,
    ...(stats?.content.kind === 'stats' && stats.content.groupId
      ? { liveBoardGroupId: stats.content.groupId }
      : {}),
    background: { ...screen.background },
  };
}

function withLegacyProjection(core: Omit<ShowDocument, 'scenes' | 'defaultSceneId'>): ShowDocument {
  return {
    ...core,
    scenes: core.screens.map(legacySceneForScreen),
    defaultSceneId: core.defaultScreenId,
  };
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
  if (version === PICTA_V3_FORMAT_VERSION) return parsePictaV3(text);
  if (version !== PICTA_V2_FORMAT_VERSION)
    return fail(
      'unsupported-version',
      `This parser expects Picta show version ${PICTA_V2_FORMAT_VERSION}.`,
    );
  const media = parseMediaResource(raw['media']);
  if (typeof media === 'string') return fail('invalid-media', media);
  const team = raw['team'] === undefined ? undefined : parseTeamResource(raw['team']);
  if (typeof team === 'string') return fail('invalid-team', team);
  const event = parseEvent(raw['event'] ?? {}, team?.data);
  if (typeof event === 'string') return fail('invalid-event', event);
  const referenceError = validateShowEventReferences(event, team?.data);
  if (referenceError) return fail('invalid-event', referenceError);
  let scenesValue: unknown = raw['scenes'];
  let defaultSceneId: unknown = raw['defaultSceneId'];
  // PR #1 briefly used a single layout at the top level. Read that shape as
  // one scene, but always return the final v2 scenes schema to callers.
  if (scenesValue === undefined) {
    const layout = raw['layout'];
    const background = raw['background'] ?? { kind: 'black' };
    const groupId = raw['liveBoardGroupId'];
    scenesValue = [
      {
        id: 'scene-1',
        name: 'Default',
        layout,
        ...(groupId === undefined ? {} : { liveBoardGroupId: groupId }),
        background,
      },
    ];
    defaultSceneId = 'scene-1';
  }
  const sceneCheck = validateScenes(scenesValue, defaultSceneId, team?.data);
  if (!sceneCheck.ok) return fail('invalid-scenes', sceneCheck.message);
  const screens = sceneCheck.scenes.map<Screen>((scene) => {
    const panels = flattenLegacyLayout(scene.layout, scene.liveBoardGroupId);
    const mediaPanel = panels.find((item) => item.content.kind === 'media');
    return {
      id: scene.id,
      name: scene.name,
      panels,
      background: { ...scene.background },
      ...(mediaPanel ? { cueTargetPanelId: mediaPanel.id } : {}),
      ...(panels.length > 2 ? { importedLayout: true } : {}),
    };
  });
  return {
    ok: true,
    value: withLegacyProjection({
      version: 3,
      media,
      ...(team === undefined ? {} : { team }),
      event,
      screens,
      defaultScreenId: sceneCheck.defaultSceneId,
    }),
  };
}

export function parsePictaV3(text: string): ShowParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('invalid-json', 'This show file is not valid JSON.');
  }
  if (!isObject(raw)) return fail('not-an-object', 'This does not look like a Picta show.');
  if (raw['version'] !== PICTA_V3_FORMAT_VERSION)
    return fail(
      'unsupported-version',
      `This parser expects Picta show version ${PICTA_V3_FORMAT_VERSION}.`,
    );
  const media = parseMediaResource(raw['media']);
  if (typeof media === 'string') return fail('invalid-media', media);
  const team = raw['team'] === undefined ? undefined : parseTeamResource(raw['team']);
  if (typeof team === 'string') return fail('invalid-team', team);
  const event = parseEvent(raw['event'] ?? {}, team?.data);
  if (typeof event === 'string') return fail('invalid-event', event);
  const referenceError = validateShowEventReferences(event, team?.data);
  if (referenceError) return fail('invalid-event', referenceError);
  const checked = validateScreens(raw['screens'], raw['defaultScreenId']);
  if (!checked.ok) return fail('invalid-screens', checked.message);
  return {
    ok: true,
    value: withLegacyProjection({
      version: 3,
      media,
      ...(team === undefined ? {} : { team }),
      event,
      screens: checked.screens,
      defaultScreenId: checked.defaultScreenId,
    }),
  };
}

export function parseShow(text: string): ShowParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('invalid-json', 'This show file is not valid JSON.');
  }
  if (!isObject(raw)) return fail('not-an-object', 'This does not look like a Picta show.');
  return raw['version'] === 3 ? parsePictaV3(text) : parsePictaV2(text);
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

export function serializePictaV2(
  show: LegacyShowDocumentV2 | ShowDocument,
  filePath: string,
  style: PathStyle,
): string {
  const body: Record<string, unknown> = {
    version: PICTA_V2_FORMAT_VERSION,
    media: serializeMediaResource(show.media, filePath, style),
    ...(show.team === undefined ? {} : { team: serializeTeamResource(show.team, filePath, style) }),
    event: {
      stats: show.event.stats,
      liveGroups: show.event.liveGroups,
    },
    scenes: show.scenes,
    defaultSceneId: show.defaultSceneId,
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

/** New and updated shows are always written as v3. */
export function serializePictaV3(show: ShowDocument, filePath: string, style: PathStyle): string {
  const body: Record<string, unknown> = {
    version: PICTA_V3_FORMAT_VERSION,
    media: serializeMediaResource(show.media, filePath, style),
    ...(show.team === undefined ? {} : { team: serializeTeamResource(show.team, filePath, style) }),
    event: {
      stats: show.event.stats,
      liveGroups: show.event.liveGroups,
      score: show.event.score ?? defaultVolleyballScore(show.team?.data),
    },
    screens: show.screens,
    defaultScreenId: show.defaultScreenId,
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
  const legacyLayout = legacyLayoutToTree(parsed.layout);
  const legacyScene: Scene = {
    id: 'screen-1',
    name: 'Imported Screen',
    layout: legacyLayout,
    ...(team === undefined ? {} : { liveBoardGroupId: 'on-court' }),
    background: { kind: 'black' },
  };
  const panels = flattenLegacyLayout(legacyLayout, team === undefined ? undefined : 'on-court');
  const importedScreen: Screen = {
    id: legacyScene.id,
    name: legacyScene.name,
    panels,
    background: { kind: 'black' },
    ...(panels.find((item) => item.content.kind === 'media')
      ? { cueTargetPanelId: panels.find((item) => item.content.kind === 'media')!.id }
      : {}),
  };
  return withLegacyProjection({
    version: 3,
    media: { kind: 'inline', data: media },
    ...(team === undefined ? {} : { team: { kind: 'inline', data: team } }),
    event: {
      stats,
      liveGroups: liveIds.length > 0 ? { 'on-court': liveIds } : {},
      score: defaultVolleyballScore(team),
    },
    screens: [importedScreen],
    defaultScreenId: importedScreen.id,
  });
}

/** Default document for a new volleyball-oriented show. */
export function defaultShowDocument(): ShowDocument {
  const screenSet = defaultVolleyballScreens();
  return withLegacyProjection({
    version: 3,
    media: { kind: 'inline', data: defaultMediaSet('Inline Media') },
    event: { stats: {}, liveGroups: {}, score: defaultVolleyballScore() },
    ...screenSet,
  });
}
