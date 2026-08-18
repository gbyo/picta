/** Parser and serializer for the portable `.pictateam` format. */

import type { MediaRef, Player, PlayerGroup, Team } from './domain.js';
import { isSupportedImagePath, isSupportedVideoPath } from './media.js';
import { resolveStoredPath, storedPathFor, type PathStyle } from './paths.js';
import { makeCustomSport, type CustomSportDefinition } from './sports.js';
import { validateTeamReferences } from './teams.js';

export const TEAM_FORMAT_VERSION = 1;
export const TEAM_MAX_SUPPORTED_VERSION = 1;

export type TeamParseErrorKind =
  | 'invalid-json'
  | 'not-an-object'
  | 'missing-version'
  | 'unsupported-version'
  | 'invalid-team'
  | 'invalid-player'
  | 'invalid-group'
  | 'invalid-sport';

export type TeamParseResult =
  { ok: true; value: Team } | { ok: false; kind: TeamParseErrorKind; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(kind: TeamParseErrorKind, message: string): TeamParseResult {
  return { ok: false, kind, message };
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !value.includes('\0');
}

function validColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function parseMediaRef(
  value: unknown,
  kind: 'photo' | 'introVideo',
  playerIndex: number,
): MediaRef | undefined | string {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0')) {
    return `Player ${playerIndex} has an invalid ${kind} path.`;
  }
  const valid = kind === 'photo' ? isSupportedImagePath(value) : isSupportedVideoPath(value);
  if (!valid) return `Player ${playerIndex} has an unsupported ${kind} file.`;
  return { path: value.trim() };
}

function parseCustomSport(value: unknown): CustomSportDefinition | string | undefined {
  if (value === undefined) return undefined;
  if (
    !isObject(value) ||
    typeof value['name'] !== 'string' ||
    value['name'].trim() === '' ||
    !Array.isArray(value['stats'])
  ) {
    return 'This team has an invalid custom sport definition.';
  }
  const stats: { id: string; label: string; shortLabel: string }[] = [];
  const statIds = new Set<string>();
  for (let i = 0; i < value['stats'].length; i += 1) {
    const raw = value['stats'][i];
    if (
      !isObject(raw) ||
      !validId(raw['id']) ||
      !validId(raw['label']) ||
      !validId(raw['shortLabel'])
    ) {
      return `Custom sport statistic ${i + 1} is invalid.`;
    }
    if (statIds.has(raw['id'])) return `Custom sport statistic ${i + 1} duplicates an id.`;
    statIds.add(raw['id']);
    stats.push({ id: raw['id'], label: raw['label'], shortLabel: raw['shortLabel'] });
  }
  const positionIds = new Set<string>();
  if (value['positions'] !== undefined && !Array.isArray(value['positions'])) {
    return 'This team has invalid custom sport positions.';
  }
  const positions: { id: string; label: string; shortLabel: string }[] = [];
  if (Array.isArray(value['positions'])) {
    for (let i = 0; i < value['positions'].length; i += 1) {
      const raw = value['positions'][i];
      if (
        !isObject(raw) ||
        !validId(raw['id']) ||
        !validId(raw['label']) ||
        !validId(raw['shortLabel'])
      ) {
        return `Custom sport position ${i + 1} is invalid.`;
      }
      if (positionIds.has(raw['id'])) return `Custom sport position ${i + 1} duplicates an id.`;
      positionIds.add(raw['id']);
      positions.push({ id: raw['id'], label: raw['label'], shortLabel: raw['shortLabel'] });
    }
  }
  return makeCustomSport(value['name'], stats, positions);
}

function parsePlayer(value: unknown, index: number): Player | string {
  if (!isObject(value)) return `Player ${index} is not an object.`;
  if (!validId(value['id'])) return `Player ${index} has no stable id.`;
  if (
    typeof value['number'] !== 'string' ||
    typeof value['name'] !== 'string' ||
    value['name'].trim() === ''
  ) {
    return `Player ${index} needs a name and string jersey number.`;
  }
  if (value['position'] !== undefined && typeof value['position'] !== 'string') {
    return `Player ${index} has an invalid position.`;
  }
  if (!isObject(value['media'] ?? {})) return `Player ${index} has invalid media.`;
  const media = value['media'] as Record<string, unknown>;
  const photo = parseMediaRef(media['photo'], 'photo', index);
  if (typeof photo === 'string') return photo;
  const introVideo = parseMediaRef(media['introVideo'], 'introVideo', index);
  if (typeof introVideo === 'string') return introVideo;
  const featured = value['featuredStats'];
  if (
    featured !== undefined &&
    (!Array.isArray(featured) || featured.some((item) => !validId(item)))
  ) {
    return `Player ${index} has invalid featured statistics.`;
  }
  if (Array.isArray(featured) && new Set(featured).size !== featured.length) {
    return `Player ${index} has duplicate featured statistics.`;
  }
  return {
    id: value['id'],
    number: value['number'].trim(),
    name: value['name'].trim(),
    ...(typeof value['position'] === 'string' && value['position'].trim()
      ? { position: value['position'].trim() }
      : {}),
    media: {
      ...(photo === undefined ? {} : { photo }),
      ...(introVideo === undefined ? {} : { introVideo }),
    },
    ...(Array.isArray(featured) && featured.length > 0
      ? { featuredStats: featured.map((item) => String(item)) }
      : {}),
  };
}

function parseGroup(value: unknown, index: number): PlayerGroup | string {
  if (
    !isObject(value) ||
    !validId(value['id']) ||
    !validId(value['name']) ||
    !Array.isArray(value['playerIds'])
  ) {
    return `Group ${index} is invalid.`;
  }
  if (value['playerIds'].some((item) => !validId(item)))
    return `Group ${index} has invalid player ids.`;
  const max = value['maxPlayers'];
  if (max !== undefined && (typeof max !== 'number' || !Number.isInteger(max) || max < 1)) {
    return `Group ${index} has an invalid maxPlayers value.`;
  }
  const playerIds = value['playerIds'].map((item) => String(item));
  if (new Set(playerIds).size !== playerIds.length)
    return `Group ${index} contains a duplicate player id.`;
  return {
    id: value['id'],
    name: value['name'].trim(),
    playerIds,
    ...(max === undefined ? {} : { maxPlayers: max }),
  };
}

export function parseTeam(text: string): TeamParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('invalid-json', 'This team file is not valid JSON.');
  }
  if (!isObject(raw)) return fail('not-an-object', 'This does not look like a Picta team file.');
  const version = raw['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return fail('missing-version', 'This team file has no valid version.');
  if (version > TEAM_MAX_SUPPORTED_VERSION)
    return fail(
      'unsupported-version',
      `This team file uses version ${version}. Update Picta to open it.`,
    );
  if (!validId(raw['id']) || typeof raw['name'] !== 'string' || raw['name'].trim() === '')
    return fail('invalid-team', 'A team needs an id and name.');
  if (
    typeof raw['sport'] !== 'string' ||
    !['volleyball', 'basketball', 'soccer', 'football', 'baseball', 'softball', 'custom'].includes(
      raw['sport'],
    )
  )
    return fail('invalid-sport', 'This team uses an unsupported sport.');
  if (
    !isObject(raw['colors']) ||
    !validColor(raw['colors']['primary']) ||
    !validColor(raw['colors']['secondary'])
  )
    return fail('invalid-team', 'A team needs valid primary and secondary hex colors.');
  const customSport = raw['sport'] === 'custom' ? parseCustomSport(raw['customSport']) : undefined;
  if (typeof customSport === 'string') return fail('invalid-sport', customSport);
  if (raw['sport'] === 'custom' && customSport === undefined)
    return fail('invalid-sport', 'Custom teams must include their custom sport definition.');
  if (!Array.isArray(raw['players']) || !Array.isArray(raw['groups']))
    return fail('invalid-team', 'A team needs players and groups arrays.');
  const players: Player[] = [];
  for (let i = 0; i < raw['players'].length; i += 1) {
    const player = parsePlayer(raw['players'][i], i + 1);
    if (typeof player === 'string') return fail('invalid-player', player);
    players.push(player);
  }
  const groups: PlayerGroup[] = [];
  for (let i = 0; i < raw['groups'].length; i += 1) {
    const group = parseGroup(raw['groups'][i], i + 1);
    if (typeof group === 'string') return fail('invalid-group', group);
    groups.push(group);
  }
  const team: Team = {
    version: 1,
    id: raw['id'],
    name: raw['name'].trim(),
    sport: raw['sport'],
    colors: { primary: raw['colors']['primary'], secondary: raw['colors']['secondary'] },
    players,
    groups,
    ...(customSport === undefined ? {} : { customSport }),
  };
  const referenceError = validateTeamReferences(team);
  if (referenceError) return fail('invalid-group', referenceError);
  return { ok: true, value: team };
}

function storedRef(
  ref: MediaRef | undefined,
  filePath: string,
  style: PathStyle,
): string | undefined {
  return ref ? storedPathFor(ref.path, filePath, style) : undefined;
}

export function serializeTeam(team: Team, filePath: string, style: PathStyle): string {
  const body: Record<string, unknown> = {
    version: TEAM_FORMAT_VERSION,
    id: team.id,
    name: team.name,
    sport: team.sport,
    colors: { ...team.colors },
    players: team.players.map((player) => ({
      id: player.id,
      number: player.number,
      name: player.name,
      ...(player.position ? { position: player.position } : {}),
      media: {
        ...(storedRef(player.media.photo, filePath, style) === undefined
          ? {}
          : { photo: storedRef(player.media.photo, filePath, style) }),
        ...(storedRef(player.media.introVideo, filePath, style) === undefined
          ? {}
          : { introVideo: storedRef(player.media.introVideo, filePath, style) }),
      },
      ...(player.featuredStats && player.featuredStats.length > 0
        ? { featuredStats: player.featuredStats.slice(0, 4) }
        : {}),
    })),
    groups: team.groups.map((group) => ({
      id: group.id,
      name: group.name,
      playerIds: group.playerIds.slice(),
      ...(group.maxPlayers === undefined ? {} : { maxPlayers: group.maxPlayers }),
    })),
  };
  if (team.sport === 'custom' && team.customSport) {
    body['customSport'] = {
      name: team.customSport.name,
      positions: team.customSport.positions,
      stats: team.customSport.stats.map(({ id, label, shortLabel }) => ({ id, label, shortLabel })),
    };
  }
  return `${JSON.stringify(body, null, 2)}\n`;
}

export function resolveTeamPaths(team: Team, filePath: string, style: PathStyle): Team {
  const resolveRef = (ref: MediaRef | undefined): MediaRef | undefined =>
    ref ? { ...ref, path: resolveStoredPath(ref.path, filePath, style) } : undefined;
  return {
    ...team,
    players: team.players.map((player) => {
      const photo = resolveRef(player.media.photo);
      const introVideo = resolveRef(player.media.introVideo);
      return {
        ...player,
        media: {
          ...(photo === undefined ? {} : { photo }),
          ...(introVideo === undefined ? {} : { introVideo }),
        },
      };
    }),
  };
}
