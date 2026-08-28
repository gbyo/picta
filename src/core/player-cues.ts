/**
 * Canonical player-to-cue conversion shared by every presentation path.
 *
 * Callers express intent rather than rebuilding cards or re-deriving stats:
 *
 *   card       always a player card, even when an intro video exists
 *   video      always the intro video, or null when there is none
 *   preferred  the intro video when it is usable, otherwise the player card
 *
 * Ordered groups and manual lineups both use `preferred`, so the same player
 * produces the same output no matter who decided to show them.
 */

import type { Cue, EventState, Player, PlayerCardCue, Team, VideoCue } from './domain.js';
import { boardStatDefinitions, sportDefinition } from './sports.js';
import { emptyRawStats } from './sports.js';

export type PlayerCueMode = 'preferred' | 'card' | 'video';
export type CueTarget = 'program' | 'full-board';

export interface PlayerCueOptions {
  mode?: PlayerCueMode;
  target?: CueTarget;
}

const CARD_HOLD_MS = 9000;

/** True when the player has an intro video Picta believes it can play. */
export function playerHasVideo(player: Player): boolean {
  const introVideo = player.media.introVideo;
  return introVideo !== undefined && !introVideo.missing;
}

/** The player's intro video, or null when it is absent or known missing. */
export function playerVideoCue(player: Player, target: CueTarget = 'program'): VideoCue | null {
  const introVideo = player.media.introVideo;
  if (!introVideo || introVideo.missing) return null;
  return {
    type: 'video',
    target,
    path: introVideo.path,
    playerId: player.id,
    label: player.name,
  };
}

/**
 * The player's card.  Stats are resolved here and only here so every caller
 * shows the same numbers.
 */
export function playerCardCue(
  player: Player,
  team: Team,
  event: EventState,
  target: CueTarget = 'program',
): PlayerCardCue {
  const definition = sportDefinition(team.sport, team.customSport);
  const stats = event.stats[player.id] ?? emptyRawStats(definition);
  return {
    type: 'player-card',
    target,
    playerId: player.id,
    holdMs: CARD_HOLD_MS,
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

/**
 * Build the cue a caller asked for.  `video` returns null rather than quietly
 * degrading to a card, so an explicit Play Video can report the failure.
 */
export function playerCue(
  player: Player,
  team: Team,
  event: EventState,
  options: PlayerCueOptions = {},
): Cue | null {
  const { mode = 'preferred', target = 'program' } = options;
  if (mode === 'card') return playerCardCue(player, team, event, target);
  const video = playerVideoCue(player, target);
  if (mode === 'video') return video;
  return video ?? playerCardCue(player, team, event, target);
}

/** Ordered groups present each player with the preferred presentation. */
export function cuesForPlayers(
  playerIds: readonly string[],
  team: Team,
  event: EventState,
  target: CueTarget = 'program',
): Cue[] {
  return playerIds
    .map((playerId) => team.players.find((player) => player.id === playerId))
    .map((player) =>
      player ? playerCue(player, team, event, { mode: 'preferred', target }) : null,
    )
    .filter((cue): cue is Cue => cue !== null);
}
