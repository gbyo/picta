/** Pure team, player and reusable-group operations. */

import type { MediaRef, Player, PlayerGroup, Team } from './domain.js';
import {
  defaultGroupsForSport,
  getSportDefinition,
  makeCustomSport,
  type CustomSportDefinition,
} from './sports.js';

let idCounter = 0;

export function opaqueId(prefix: string): string {
  idCounter += 1;
  const random = globalThis.crypto?.randomUUID?.();
  return random
    ? `${prefix}-${random}`
    : `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function makePlayer(
  number: string,
  name: string,
  position = '',
  id = opaqueId('player'),
): Player {
  return {
    id,
    number: number.trim(),
    name: name.trim(),
    ...(position.trim() ? { position: position.trim() } : {}),
    media: {},
  };
}

export function makeGroup(
  name: string,
  playerIds: readonly string[] = [],
  id = opaqueId('group'),
): PlayerGroup {
  return { id, name: name.trim(), playerIds: playerIds.slice() };
}

export function createTeam(
  name: string,
  sport: string,
  primary = '#111111',
  secondary = '#ffffff',
  customSport?: CustomSportDefinition,
  id = opaqueId('team'),
): Team {
  const portableCustom =
    sport === 'custom' ? (customSport ?? makeCustomSport('Custom', [])) : undefined;
  const definition = getSportDefinition(sport, portableCustom);
  return {
    version: 1,
    id,
    name: name.trim() || 'Untitled Team',
    sport: definition.id,
    colors: { primary, secondary },
    players: [],
    groups: defaultGroupsForSport(definition),
    ...(definition.id === 'custom' && portableCustom ? { customSport: portableCustom } : {}),
  };
}

export function updatePlayerMedia(
  player: Player,
  media: { photo?: MediaRef; introVideo?: MediaRef },
): Player {
  return { ...player, media: { ...player.media, ...media } };
}

export function addPlayer(team: Team, player: Player): Team {
  if (team.players.some((item) => item.id === player.id)) return team;
  return { ...team, players: [...team.players, player] };
}

export function updatePlayer(team: Team, player: Player): Team {
  if (!team.players.some((item) => item.id === player.id)) return team;
  return { ...team, players: team.players.map((item) => (item.id === player.id ? player : item)) };
}

export function removePlayer(team: Team, playerId: string): Team {
  return {
    ...team,
    players: team.players.filter((player) => player.id !== playerId),
    groups: team.groups.map((group) => ({
      ...group,
      playerIds: group.playerIds.filter((id) => id !== playerId),
    })),
  };
}

export function addGroup(team: Team, group: PlayerGroup): Team {
  if (team.groups.some((item) => item.id === group.id)) return team;
  return { ...team, groups: [...team.groups, group] };
}

export function removeGroup(team: Team, groupId: string): Team {
  return { ...team, groups: team.groups.filter((group) => group.id !== groupId) };
}

export function reorderGroup(team: Team, from: number, to: number): Team {
  if (from < 0 || from >= team.groups.length) return team;
  const groups = team.groups.slice();
  const [group] = groups.splice(from, 1);
  if (!group) return team;
  groups.splice(Math.max(0, Math.min(groups.length, to)), 0, group);
  return { ...team, groups };
}

export function setGroupPlayers(team: Team, groupId: string, playerIds: readonly string[]): Team {
  const playerSet = new Set(team.players.map((player) => player.id));
  return {
    ...team,
    groups: team.groups.map((group) => {
      if (group.id !== groupId) return group;
      const ids = [...new Set(playerIds)].filter((id) => playerSet.has(id));
      return {
        ...group,
        playerIds: group.maxPlayers === undefined ? ids : ids.slice(0, group.maxPlayers),
      };
    }),
  };
}

export function reorderGroupPlayer(team: Team, groupId: string, from: number, to: number): Team {
  const group = team.groups.find((item) => item.id === groupId);
  if (!group || from < 0 || from >= group.playerIds.length) return team;
  const playerIds = group.playerIds.slice();
  const [playerId] = playerIds.splice(from, 1);
  if (playerId === undefined) return team;
  playerIds.splice(Math.max(0, Math.min(playerIds.length, to)), 0, playerId);
  return setGroupPlayers(team, groupId, playerIds);
}

export function addPlayerToGroup(team: Team, groupId: string, playerId: string): Team {
  const group = team.groups.find((item) => item.id === groupId);
  if (!group || !team.players.some((player) => player.id === playerId)) return team;
  if (group.playerIds.includes(playerId)) return team;
  if (group.maxPlayers !== undefined && group.playerIds.length >= group.maxPlayers) return team;
  return setGroupPlayers(team, groupId, [...group.playerIds, playerId]);
}

export function removePlayerFromGroup(team: Team, groupId: string, playerId: string): Team {
  const group = team.groups.find((item) => item.id === groupId);
  if (!group) return team;
  return setGroupPlayers(
    team,
    groupId,
    group.playerIds.filter((id) => id !== playerId),
  );
}

export function setLiveGroupPlayers(
  liveGroups: Readonly<Record<string, readonly string[]>>,
  groupId: string,
  playerIds: readonly string[],
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [id, ids] of Object.entries(liveGroups)) next[id] = [...ids];
  next[groupId] = [...new Set(playerIds)];
  return next;
}

export function groupPlayers(
  team: Team | undefined,
  groupId: string | undefined,
  liveGroups: Readonly<Record<string, readonly string[]>> = {},
): Player[] {
  if (!team || !groupId) return [];
  const group = team.groups.find((item) => item.id === groupId);
  if (!group) return [];
  const ids = liveGroups[groupId] ?? group.playerIds;
  return ids
    .map((id) => team.players.find((player) => player.id === id))
    .filter((player): player is Player => player !== undefined);
}

export function validateTeamReferences(team: Pick<Team, 'players' | 'groups'>): string | null {
  const playerIds = new Set<string>();
  for (const player of team.players) {
    if (playerIds.has(player.id)) return `Duplicate player id "${player.id}".`;
    playerIds.add(player.id);
  }
  const groupIds = new Set<string>();
  for (const group of team.groups) {
    if (groupIds.has(group.id)) return `Duplicate group id "${group.id}".`;
    groupIds.add(group.id);
    if (
      group.maxPlayers !== undefined &&
      (!Number.isInteger(group.maxPlayers) || group.maxPlayers < 1)
    ) {
      return `Group "${group.name}" has an invalid maximum player count.`;
    }
    const seen = new Set<string>();
    for (const playerId of group.playerIds) {
      if (!playerIds.has(playerId)) return `Group "${group.name}" references a missing player.`;
      if (seen.has(playerId)) return `Group "${group.name}" references a player twice.`;
      seen.add(playerId);
    }
    if (group.maxPlayers !== undefined && group.playerIds.length > group.maxPlayers) {
      return `Group "${group.name}" exceeds its maximum player count.`;
    }
  }
  return null;
}

export function cloneTeam(team: Team): Team {
  return JSON.parse(JSON.stringify(team)) as Team;
}
