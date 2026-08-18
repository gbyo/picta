/**
 * Sport definitions.
 *
 * Controllers and renderers consume these definitions rather than branching
 * on a sport id.  A sport describes labels, positions, counters and useful
 * default groups; the shared player and board code remains sport-neutral.
 */

import type {
  BoardColumn,
  BoardData,
  BoardRow,
  Player,
  PlayerGroup,
  RawPlayerStats,
} from './domain.js';

export interface PositionDefinition {
  id: string;
  label: string;
  shortLabel: string;
}

export interface StatDefinition {
  id: string;
  label: string;
  shortLabel: string;
  /** Lower values are removed first when a board becomes too narrow. */
  priority: number;
}

export interface GroupPreset {
  id: string;
  name: string;
  maxPlayers?: number;
}

export interface CustomStatDefinition extends StatDefinition {}

export interface CustomSportDefinition {
  id: 'custom';
  name: string;
  positions: PositionDefinition[];
  stats: CustomStatDefinition[];
  defaultGroups: GroupPreset[];
  defaultFeaturedStats: string[];
  defaultBoardStats: string[];
}

export interface SportDefinition {
  id: string;
  name: string;
  positions: PositionDefinition[];
  stats: StatDefinition[];
  defaultGroups: GroupPreset[];
  defaultFeaturedStats: string[];
  defaultBoardStats: string[];
  /** Optional compound actions, keyed by the action that the operator taps. */
  compoundActions?: Record<string, string[]>;
}

export const BUILT_IN_SPORT_IDS = [
  'volleyball',
  'basketball',
  'soccer',
  'football',
  'baseball',
  'softball',
  'custom',
] as const;

export type BuiltInSportId = (typeof BUILT_IN_SPORT_IDS)[number];

const stat = (id: string, label: string, shortLabel: string, priority: number): StatDefinition => ({
  id,
  label,
  shortLabel,
  priority,
});

const position = (
  id: string,
  label: string,
  shortLabel = id.toUpperCase(),
): PositionDefinition => ({
  id,
  label,
  shortLabel,
});

const group = (id: string, name: string, maxPlayers?: number): GroupPreset => ({
  id,
  name,
  ...(maxPlayers === undefined ? {} : { maxPlayers }),
});

const VOLLEYBALL: SportDefinition = {
  id: 'volleyball',
  name: 'Volleyball',
  positions: [
    position('outside-hitter', 'Outside Hitter', 'OH'),
    position('opposite', 'Opposite', 'OPP'),
    position('middle-blocker', 'Middle Blocker', 'MB'),
    position('setter', 'Setter', 'S'),
    position('libero', 'Libero', 'L'),
    position('defensive-specialist', 'Defensive Specialist', 'DS'),
  ],
  stats: [
    stat('kills', 'Kills', 'K', 100),
    stat('attackErrors', 'Attack Errors', 'E', 35),
    stat('attempts', 'Attempts', 'TA', 90),
    stat('assists', 'Assists', 'A', 80),
    stat('aces', 'Aces', 'SA', 75),
    stat('serviceErrors', 'Service Errors', 'SE', 20),
    stat('digs', 'Digs', 'D', 70),
    stat('blockSolos', 'Block Solos', 'BS', 60),
    stat('blockAssists', 'Block Assists', 'BA', 55),
  ],
  defaultGroups: [group('starting-lineup', 'Starting Lineup', 6), group('on-court', 'On Court', 6)],
  defaultFeaturedStats: ['kills', 'digs', 'aces'],
  defaultBoardStats: ['kills', 'assists', 'digs', 'blockSolos'],
  compoundActions: {
    kills: ['attempts'],
    attackErrors: ['attempts'],
  },
};

const BASKETBALL: SportDefinition = {
  id: 'basketball',
  name: 'Basketball',
  positions: [
    position('point-guard', 'Point Guard', 'PG'),
    position('shooting-guard', 'Shooting Guard', 'SG'),
    position('small-forward', 'Small Forward', 'SF'),
    position('power-forward', 'Power Forward', 'PF'),
    position('center', 'Center', 'C'),
  ],
  stats: [
    stat('points', 'Points', 'PTS', 100),
    stat('rebounds', 'Rebounds', 'REB', 80),
    stat('assists', 'Assists', 'AST', 75),
    stat('steals', 'Steals', 'STL', 60),
    stat('blocks', 'Blocks', 'BLK', 55),
    stat('fouls', 'Fouls', 'PF', 20),
  ],
  defaultGroups: [group('starters', 'Starters', 5), group('on-court', 'On Court', 5)],
  defaultFeaturedStats: ['points', 'rebounds', 'assists'],
  defaultBoardStats: ['points', 'rebounds', 'assists', 'steals'],
};

const SOCCER: SportDefinition = {
  id: 'soccer',
  name: 'Soccer',
  positions: [
    position('goalkeeper', 'Goalkeeper', 'GK'),
    position('defender', 'Defender', 'DEF'),
    position('midfielder', 'Midfielder', 'MID'),
    position('forward', 'Forward', 'FWD'),
  ],
  stats: [
    stat('goals', 'Goals', 'G', 100),
    stat('assists', 'Assists', 'A', 85),
    stat('shots', 'Shots', 'SH', 70),
    stat('saves', 'Saves', 'SV', 65),
  ],
  defaultGroups: [group('starting-xi', 'Starting XI', 11), group('on-field', 'On Field', 11)],
  defaultFeaturedStats: ['goals', 'assists', 'shots'],
  defaultBoardStats: ['goals', 'assists', 'shots', 'saves'],
};

const FOOTBALL: SportDefinition = {
  id: 'football',
  name: 'Football',
  positions: [
    position('quarterback', 'Quarterback', 'QB'),
    position('running-back', 'Running Back', 'RB'),
    position('wide-receiver', 'Wide Receiver', 'WR'),
    position('tight-end', 'Tight End', 'TE'),
    position('linebacker', 'Linebacker', 'LB'),
    position('defensive-back', 'Defensive Back', 'DB'),
    position('kicker', 'Kicker', 'K'),
  ],
  stats: [
    stat('touchdowns', 'Touchdowns', 'TD', 100),
    stat('yards', 'Yards', 'YDS', 90),
    stat('receptions', 'Receptions', 'REC', 75),
    stat('tackles', 'Tackles', 'TKL', 80),
  ],
  defaultGroups: [
    group('starting-offense', 'Starting Offense'),
    group('starting-defense', 'Starting Defense'),
    group('special-teams', 'Special Teams'),
  ],
  defaultFeaturedStats: ['touchdowns', 'yards'],
  defaultBoardStats: ['touchdowns', 'yards', 'receptions', 'tackles'],
};

const BASEBALL: SportDefinition = {
  id: 'baseball',
  name: 'Baseball',
  positions: [
    position('pitcher', 'Pitcher', 'P'),
    position('catcher', 'Catcher', 'C'),
    position('infielder', 'Infielder', 'IF'),
    position('outfielder', 'Outfielder', 'OF'),
  ],
  stats: [
    stat('hits', 'Hits', 'H', 100),
    stat('runs', 'Runs', 'R', 85),
    stat('rbis', 'RBIs', 'RBI', 80),
    stat('homeRuns', 'Home Runs', 'HR', 90),
    stat('strikeouts', 'Strikeouts', 'K', 60),
  ],
  defaultGroups: [
    group('starting-lineup', 'Starting Lineup', 9),
    group('batting-order', 'Batting Order', 9),
    group('defense', 'Defense', 9),
  ],
  defaultFeaturedStats: ['hits', 'runs', 'rbis'],
  defaultBoardStats: ['hits', 'runs', 'rbis', 'homeRuns'],
};

const SOFTBALL: SportDefinition = {
  ...BASEBALL,
  id: 'softball',
  name: 'Softball',
};

const BUILT_INS: Record<Exclude<BuiltInSportId, 'custom'>, SportDefinition> = {
  volleyball: VOLLEYBALL,
  basketball: BASKETBALL,
  soccer: SOCCER,
  football: FOOTBALL,
  baseball: BASEBALL,
  softball: SOFTBALL,
};

export function sportDefinition(id: string, custom?: CustomSportDefinition): SportDefinition {
  if (id === 'custom' && custom) return custom;
  return (
    BUILT_INS[id as Exclude<BuiltInSportId, 'custom'>] ?? {
      id: 'custom',
      name: 'Custom',
      positions: [],
      stats: [],
      defaultGroups: [],
      defaultFeaturedStats: [],
      defaultBoardStats: [],
    }
  );
}

export const getSportDefinition = sportDefinition;

export function allBuiltInSports(): SportDefinition[] {
  return Object.values(BUILT_INS).map((definition) => ({
    ...definition,
    positions: definition.positions.map((item) => ({ ...item })),
    stats: definition.stats.map((item) => ({ ...item })),
    defaultGroups: definition.defaultGroups.map((item) => ({ ...item })),
    defaultFeaturedStats: definition.defaultFeaturedStats.slice(),
    defaultBoardStats: definition.defaultBoardStats.slice(),
  }));
}

export function makeCustomSport(
  name: string,
  stats: readonly Pick<CustomStatDefinition, 'id' | 'label' | 'shortLabel'>[],
  positions: readonly PositionDefinition[] = [],
): CustomSportDefinition {
  const unique = new Set<string>();
  const cleanStats = stats
    .map((item, index) => ({
      id: item.id.trim(),
      label: item.label.trim(),
      shortLabel: item.shortLabel.trim(),
      priority: Math.max(1, stats.length - index),
    }))
    .filter((item) => {
      if (!item.id || !item.label || !item.shortLabel || unique.has(item.id)) return false;
      unique.add(item.id);
      return true;
    });
  return {
    id: 'custom',
    name: name.trim() || 'Custom',
    positions: positions.map((item) => ({ ...item })),
    stats: cleanStats,
    defaultGroups: [],
    defaultFeaturedStats: cleanStats.slice(0, 3).map((item) => item.id),
    defaultBoardStats: cleanStats.slice(0, 4).map((item) => item.id),
  };
}

export function defaultGroupsForSport(definition: SportDefinition): PlayerGroup[] {
  return definition.defaultGroups.map((preset) => ({
    id: preset.id,
    name: preset.name,
    ...(preset.maxPlayers === undefined ? {} : { maxPlayers: preset.maxPlayers }),
    playerIds: [],
  }));
}

export function emptyRawStats(definition: SportDefinition): RawPlayerStats {
  return Object.fromEntries(definition.stats.map((item) => [item.id, 0]));
}

function counter(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(9999, Math.floor(value as number))) : 0;
}

/** Apply one operator action, including sport-defined compound counters. */
export function recordStat(
  definition: SportDefinition,
  stats: RawPlayerStats,
  statId: string,
  delta = 1,
): RawPlayerStats {
  const known = definition.stats.some((item) => item.id === statId);
  if (!known || !Number.isFinite(delta)) return { ...stats };
  const next = { ...stats };
  next[statId] = counter((next[statId] ?? 0) + delta);
  for (const compound of definition.compoundActions?.[statId] ?? []) {
    next[compound] = counter((next[compound] ?? 0) + delta);
  }
  return next;
}

export function setRawStat(
  definition: SportDefinition,
  stats: RawPlayerStats,
  statId: string,
  value: number,
): RawPlayerStats {
  if (!definition.stats.some((item) => item.id === statId) || !Number.isFinite(value))
    return { ...stats };
  return { ...stats, [statId]: counter(value) };
}

export interface VolleyballDerivedStats {
  hittingPercentage: number | null;
  totalBlocks: number;
  points: number;
}

export function volleyballDerivedStats(stats: RawPlayerStats): VolleyballDerivedStats {
  const kills = counter(stats['kills']);
  const errors = counter(stats['attackErrors']);
  const attempts = counter(stats['attempts']);
  const blockSolos = counter(stats['blockSolos']);
  const blockAssists = counter(stats['blockAssists']);
  const aces = counter(stats['aces']);
  return {
    hittingPercentage: attempts > 0 ? (kills - errors) / attempts : null,
    totalBlocks: blockSolos + blockAssists / 2,
    points: kills + aces + blockSolos + blockAssists / 2,
  };
}

export function featuredStatIds(player: Player, definition: SportDefinition): string[] {
  const allowed = new Set(definition.stats.map((item) => item.id));
  const selected = (player.featuredStats ?? definition.defaultFeaturedStats).filter((id) =>
    allowed.has(id),
  );
  return selected.slice(0, 4);
}

export function boardStatDefinitions(
  definition: SportDefinition,
  player?: Player,
): StatDefinition[] {
  const ids = player ? featuredStatIds(player, definition) : definition.defaultBoardStats;
  const byId = new Map(definition.stats.map((item) => [item.id, item]));
  return ids
    .map((id) => byId.get(id))
    .filter((item): item is StatDefinition => item !== undefined)
    .slice(0, 4);
}

export function formatBoardData(
  players: readonly Player[],
  group: PlayerGroup | undefined,
  definition: SportDefinition,
  statsByPlayer: Record<string, RawPlayerStats>,
): BoardData {
  const ordered = group
    ? group.playerIds
        .map((id) => players.find((player) => player.id === id))
        .filter((item): item is Player => item !== undefined)
    : [];
  const columns = boardStatDefinitions(definition).map<BoardColumn>((item) => ({
    id: item.id,
    shortLabel: item.shortLabel,
    label: item.label,
  }));
  const rows = ordered.map<BoardRow>((player) => {
    const stats = statsByPlayer[player.id] ?? {};
    return {
      playerId: player.id,
      number: player.number,
      name: player.name,
      values: columns.map((column) => String(counter(stats[column.id]))),
    };
  });
  return { columns, rows };
}
