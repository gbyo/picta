/**
 * Single-player presentation, expressed as intent plus an honest outcome.
 *
 * Picta must never mark a player as shown because a queue moved on.  Playback
 * is injected so the rule that decides "did the audience actually see this?"
 * stays pure and testable, away from Tauri and the DOM.
 */

import type { Cue, EventState, Player, Team } from './domain.js';
import { playerCardCue, playerCue, type CueTarget, type PlayerCueMode } from './player-cues.js';

/** What a single cue did. `unavailable` means there was nothing to try. */
export type PresentationOutcome = 'played' | 'failed' | 'cancelled' | 'unavailable';

export interface PresentationDeps {
  /** Run one cue and report whether it actually reached the audience. */
  play(cue: Cue): Promise<Exclude<PresentationOutcome, 'unavailable'>>;
}

export interface PresentationRequest {
  mode?: PlayerCueMode;
  target?: CueTarget;
}

export interface PresentationReport {
  outcome: PresentationOutcome;
  /** The cue the audience actually saw, when one played. */
  playedCue: Cue | null;
  /** True when a preferred video failed and the card was shown instead. */
  usedCardFallback: boolean;
}

/**
 * Present one player.
 *
 * `card` and `video` are deterministic: they attempt exactly what was asked and
 * report what happened.  Only `preferred` falls back from a failed video to the
 * player card, because only `preferred` promised "show me this player" rather
 * than "play this video".
 */
export async function presentPlayer(
  player: Player,
  team: Team,
  event: EventState,
  request: PresentationRequest,
  deps: PresentationDeps,
): Promise<PresentationReport> {
  const { mode = 'preferred', target = 'program' } = request;
  const cue = playerCue(player, team, event, { mode, target });
  if (!cue) return { outcome: 'unavailable', playedCue: null, usedCardFallback: false };

  const outcome = await deps.play(cue);
  if (outcome === 'played') return { outcome, playedCue: cue, usedCardFallback: false };

  // A cancellation is the operator's decision; never paper over it with a card.
  if (mode !== 'preferred' || outcome === 'cancelled' || cue.type !== 'video')
    return { outcome, playedCue: null, usedCardFallback: false };

  const fallback = playerCardCue(player, team, event, target);
  const fallbackOutcome = await deps.play(fallback);
  return {
    outcome: fallbackOutcome,
    playedCue: fallbackOutcome === 'played' ? fallback : null,
    usedCardFallback: fallbackOutcome === 'played',
  };
}
