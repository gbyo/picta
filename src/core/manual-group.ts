/**
 * Runtime-only state for presenting a group's players one at a time.
 *
 * The session never touches the saved group: it records who has been shown and
 * in what order, nothing more.  A shown player stays selectable so the operator
 * can replay them when an announcer repeats a name — a replay presents the
 * player again without changing the first-shown order or the shown count.
 */

import type { PresentationOutcome } from './player-presentation.js';

export interface ManualGroupSession {
  groupId: string;
  playerIds: string[];
  /** First-presentation order.  This is the history Undo Last walks back. */
  shownPlayerIds: string[];
  currentPlayerId: string | null;
  /** True while the current player has already been shown once before. */
  currentIsReplay: boolean;
}

export function beginManualGroup(
  groupId: string,
  playerIds: readonly string[],
): ManualGroupSession {
  return {
    groupId,
    playerIds: [...playerIds],
    shownPlayerIds: [],
    currentPlayerId: null,
    currentIsReplay: false,
  };
}

export function manualPlayerShown(session: ManualGroupSession, playerId: string): boolean {
  return session.shownPlayerIds.includes(playerId);
}

export function manualShownCount(session: ManualGroupSession): number {
  return session.shownPlayerIds.length;
}

/** A player may start whenever nothing else is playing — shown or not. */
export function manualPlayerSelectable(session: ManualGroupSession, playerId: string): boolean {
  return session.currentPlayerId === null && session.playerIds.includes(playerId);
}

export function startManualPlayer(
  session: ManualGroupSession,
  playerId: string,
): ManualGroupSession {
  if (!manualPlayerSelectable(session, playerId)) return session;
  return {
    ...session,
    currentPlayerId: playerId,
    currentIsReplay: manualPlayerShown(session, playerId),
  };
}

/**
 * Record what the presentation actually did.  Only a played first presentation
 * marks a player shown; a replay, a failure and a cancellation all leave the
 * shown list exactly as it was.
 */
export function finishManualPlayer(
  session: ManualGroupSession,
  outcome: PresentationOutcome,
): ManualGroupSession {
  const playerId = session.currentPlayerId;
  if (!playerId) return session;
  const cleared = { ...session, currentPlayerId: null, currentIsReplay: false };
  if (outcome !== 'played' || session.currentIsReplay) return cleared;
  return { ...cleared, shownPlayerIds: [...session.shownPlayerIds, playerId] };
}

export function cancelManualPlayer(session: ManualGroupSession): ManualGroupSession {
  return finishManualPlayer(session, 'cancelled');
}

/** Undo Last unmarks the most recently first-presented player. */
export function undoManualPlayer(session: ManualGroupSession): ManualGroupSession {
  if (session.currentPlayerId !== null || session.shownPlayerIds.length === 0) return session;
  return { ...session, shownPlayerIds: session.shownPlayerIds.slice(0, -1) };
}
