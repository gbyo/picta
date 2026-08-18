/** Canonical player-to-cue conversion shared by every presentation path. */

import type { Cue, EventState, Player, Team } from './domain.js';
import { boardStatDefinitions, sportDefinition } from './sports.js';
import { emptyRawStats } from './sports.js';

export function cueForPlayer(
  player: Player,
  team: Team,
  event: EventState,
  target: 'program' | 'full-board' = 'program',
): Cue | null {
  const introVideo = player.media.introVideo;
  if (introVideo && !introVideo.missing) {
    return {
      type: 'video',
      target,
      path: introVideo.path,
      playerId: player.id,
      label: player.name,
    };
  }
  const definition = sportDefinition(team.sport, team.customSport);
  const stats = event.stats[player.id] ?? emptyRawStats(definition);
  return {
    type: 'player-card',
    target,
    playerId: player.id,
    holdMs: 9000,
    number: player.number,
    name: player.name,
    position: player.position ?? '',
    ...(player.media.photo && !player.media.photo.missing ? { photo: player.media.photo } : {}),
    stats: boardStatDefinitions(definition, player).map((item) => ({
      label: item.label,
      value: String(stats[item.id] ?? 0),
    })),
  };
}

export function cuesForPlayers(
  playerIds: readonly string[],
  team: Team,
  event: EventState,
  target: 'program' | 'full-board' = 'program',
): Cue[] {
  return playerIds
    .map((playerId) => team.players.find((player) => player.id === playerId))
    .map((player) => (player ? cueForPlayer(player, team, event, target) : null))
    .filter((cue): cue is Cue => cue !== null);
}
