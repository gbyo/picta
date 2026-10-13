/**
 * Player and lineup cues: temporary takeovers of the program.
 *
 * Every path uses the same canonical player cue, and every presentation
 * reports what actually happened. A player is marked shown in a manual lineup
 * only after the audience saw something.
 */

import type { Player, PlayerGroup } from '@core/domain.js';
import {
  beginManualGroup,
  cancelManualPlayer,
  finishManualPlayer,
  startManualPlayer,
  undoManualPlayer,
} from '@core/manual-group.js';
import { cuesForPlayers, type PlayerCueMode } from '@core/player-cues.js';
import { presentPlayer, type PresentationOutcome } from '@core/player-presentation.js';
import { rt } from '../runtime.js';
import { cueTargetFor, programScreen, teamOf } from '../state/derive.js';
import { getState, setState } from '../state/store.js';
import { notify } from './notify.js';

export function playerLabel(player: Pick<Player, 'number' | 'name'>): string {
  return `${player.number ? `#${player.number} ` : ''}${player.name}`;
}

function live(): boolean {
  return getState().output.phase === 'live';
}

function report(
  outcome: PresentationOutcome,
  usedCardFallback: boolean,
  player: Player,
  mode: PlayerCueMode,
): void {
  const name = playerLabel(player);
  if (outcome === 'cancelled') return;
  if (outcome === 'unavailable') notify.warning(`${name} has no usable intro video.`);
  else if (outcome === 'failed')
    notify.warning(
      mode === 'video' ? `${name}'s intro video could not play.` : `Could not present ${name}.`,
    );
  else if (usedCardFallback)
    notify.warning(`${name}'s intro video could not play, so the player card was shown.`);
}

async function present(player: Player, mode: PlayerCueMode) {
  const state = getState();
  const team = teamOf(state.doc.show.data);
  if (!team) return { outcome: 'unavailable' as const, usedCardFallback: false };
  const { output } = rt();
  const target = cueTargetFor(programScreen(state));
  return presentPlayer(
    player,
    team,
    state.doc.show.data.event,
    { mode, target },
    { play: (cue) => output.playCue(cue, { kind: 'single-player', label: playerLabel(player) }) },
  );
}

/** Show Card always shows the card; Intro always tries the video; Preferred falls back. */
export async function presentSinglePlayer(playerId: string, mode: PlayerCueMode): Promise<void> {
  if (!live()) return;
  const player = teamOf(getState().doc.show.data)?.players.find((item) => item.id === playerId);
  if (!player) return;
  const result = await present(player, mode);
  report(result.outcome, result.usedCardFallback, player, mode);
}

export async function playGroupInOrder(
  group: PlayerGroup,
  playerIds = group.playerIds,
): Promise<void> {
  if (!live()) return;
  const state = getState();
  const team = teamOf(state.doc.show.data);
  if (!team) return;
  const target = cueTargetFor(programScreen(state));
  const cues = cuesForPlayers(playerIds, team, state.doc.show.data.event, target);
  if (cues.length === 0) {
    notify.warning(`${group.name} has no players to present.`);
    return;
  }
  setState({ manual: null });
  const outcomes = await rt().output.playCues(cues, { kind: 'ordered-group', label: group.name });
  const failed = outcomes.filter((outcome) => outcome === 'failed').length;
  if (failed > 0)
    notify.warning(`${failed} of ${cues.length} in ${group.name} could not play and were skipped.`);
}

export function beginManualLineup(group: PlayerGroup, playerIds = group.playerIds): void {
  if (!live()) return;
  if (rt().output.cueActive) rt().output.cancelCue();
  setState({ manual: beginManualGroup(group.id, playerIds) });
}

export async function presentManualPlayer(playerId: string): Promise<void> {
  const session = getState().manual;
  if (!session || !live() || rt().output.cueActive) return;
  const player = teamOf(getState().doc.show.data)?.players.find((item) => item.id === playerId);
  if (!player) return;
  const started = startManualPlayer(session, playerId);
  if (started === session) return;
  setState({ manual: started });
  // Manual and ordered lineups share the preferred presentation.
  const result = await present(player, 'preferred');
  const latest = getState().manual;
  if (latest?.currentPlayerId === playerId)
    setState({ manual: finishManualPlayer(latest, result.outcome) });
  report(result.outcome, result.usedCardFallback, player, 'preferred');
}

export function undoManualLineup(): void {
  const session = getState().manual;
  if (session) setState({ manual: undoManualPlayer(session) });
}

export function endManualLineup(): void {
  const session = getState().manual;
  if (!session) return;
  if (session.currentPlayerId !== null) rt().output.cancelCue();
  setState({ manual: null });
}

/** End whatever cue is on air. Never stops the output itself. */
export function endCue(): void {
  const session = getState().manual;
  if (session?.currentPlayerId) setState({ manual: cancelManualPlayer(session) });
  rt().output.cancelCue();
}

export function nextCue(): void {
  rt().output.nextCue();
}

export function previousCue(): void {
  rt().output.previousCue();
}
