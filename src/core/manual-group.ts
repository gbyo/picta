/** Runtime-only state for presenting a group's players one at a time. */

export interface ManualGroupSession {
  groupId: string;
  playerIds: string[];
  shownPlayerIds: string[];
  history: string[];
  currentPlayerId: string | null;
  ended: boolean;
}

export function beginManualGroup(
  groupId: string,
  playerIds: readonly string[],
): ManualGroupSession {
  return {
    groupId,
    playerIds: [...playerIds],
    shownPlayerIds: [],
    history: [],
    currentPlayerId: null,
    ended: false,
  };
}

function eligible(session: ManualGroupSession, playerId: string): boolean {
  return (
    !session.ended &&
    session.currentPlayerId === null &&
    session.playerIds.includes(playerId) &&
    !session.shownPlayerIds.includes(playerId)
  );
}

export function startManualPlayer(
  session: ManualGroupSession,
  playerId: string,
): ManualGroupSession {
  return eligible(session, playerId) ? { ...session, currentPlayerId: playerId } : session;
}

export function completeManualPlayer(session: ManualGroupSession): ManualGroupSession {
  const playerId = session.currentPlayerId;
  if (!playerId) return session;
  return {
    ...session,
    currentPlayerId: null,
    history: [...session.history, playerId],
    shownPlayerIds: [...session.shownPlayerIds, playerId],
  };
}

export function cancelManualPlayer(session: ManualGroupSession): ManualGroupSession {
  return session.currentPlayerId === null ? session : { ...session, currentPlayerId: null };
}

export function undoManualPlayer(session: ManualGroupSession): ManualGroupSession {
  if (session.currentPlayerId !== null || session.history.length === 0) return session;
  const history = session.history.slice(0, -1);
  return {
    ...session,
    history,
    shownPlayerIds: history.slice(),
  };
}

export function endManualGroup(session: ManualGroupSession): ManualGroupSession {
  return { ...session, currentPlayerId: null, ended: true };
}

/** Replay starts the same group from the beginning without touching the show file. */
export function replayManualGroup(session: ManualGroupSession): ManualGroupSession {
  return beginManualGroup(session.groupId, session.playerIds);
}

export function manualPlayerShown(session: ManualGroupSession, playerId: string): boolean {
  return session.shownPlayerIds.includes(playerId);
}

export function manualRemainingCount(session: ManualGroupSession): number {
  return Math.max(0, session.playerIds.length - session.shownPlayerIds.length);
}
