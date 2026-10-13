/**
 * Live match state: the volleyball score and per-player statistics.
 *
 * Both are event data stored in the show, and both have their own undo
 * history so a mis-tap during a rally is one keystroke to reverse.
 */

import type { ScoreSide } from '@core/domain.js';
import {
  applyScoreAction,
  createScoreHistory,
  previewEndSet,
  setPointTarget,
  undoDescription,
  undoScore,
  type ScoreAction,
  type ScoreHistory,
} from '@core/score.js';
import { setLiveGroupPlayers } from '@core/teams.js';
import { setStatValue, stepStat, undoStat } from '@core/stat-log.js';
import { ask } from '../state/dialogs.js';
import { definitionOf, effectiveGroupIds, scoreOf, teamOf } from '../state/derive.js';
import { getState, setState } from '../state/store.js';
import { setEvent } from './edit.js';
import { notify } from './notify.js';

function commitHistory(history: ScoreHistory): void {
  setState({ scoreHistory: history });
  setEvent((event) => ({ ...event, score: history.present }));
}

/** The score history follows the document; rebuild it if the show was replaced. */
function history(): ScoreHistory {
  const state = getState();
  const score = scoreOf(state.doc.show.data);
  return state.scoreHistory.present === score ? state.scoreHistory : createScoreHistory(score);
}

export function scoreAction(action: ScoreAction): boolean {
  const before = history();
  const next = applyScoreAction(before, action);
  if (next === before) return false;
  commitHistory(next);
  return true;
}

export function rally(side: ScoreSide): void {
  scoreAction({ type: 'rally', side });
}

export function undoScoreAction(): void {
  const before = history();
  const label = undoDescription(before);
  const next = undoScore(before);
  if (next === before) return;
  commitHistory(next);
  if (label) notify.info(`Undid ${label}`);
}

/**
 * End the set. A regulation finish ends immediately (Undo reverses it); an
 * unusual finish is explained and confirmed first, because it is usually a
 * mistake but may be a correction or a local rule.
 */
export async function endSet(): Promise<void> {
  const score = history().present;
  const preview = previewEndSet(score);
  if (preview.kind === 'match-complete') {
    notify.info('The match is complete. Undo or start a new match to keep scoring.');
    return;
  }
  if (preview.kind === 'tied') {
    notify.warning('The set is tied. Change the score before ending the set.');
    return;
  }
  const winner = score[preview.winner].name;
  if (!preview.regulation) {
    const confirmed = await ask.confirm({
      title: `End set ${score.setNumber} at ${preview.winnerPoints}–${preview.loserPoints}?`,
      body: `That is not a standard finish (first to ${setPointTarget(score)}, win by two). ${winner} would win the set. Confirm only for a correction or a local rule.`,
      confirmLabel: `End Set · ${winner} wins`,
    });
    if (!confirmed) return;
  }
  if (scoreAction({ type: 'end-set', winner: preview.winner }))
    notify.undoable(
      preview.endsMatch
        ? `Final: ${winner} wins the match`
        : `Set ${score.setNumber} to ${winner}, ${preview.winnerPoints}–${preview.loserPoints}`,
      { run: undoIfStillLatest(history().present) },
    );
}

/**
 * A toast's Undo reverses that specific change, and only while it is still
 * the latest score change. Otherwise it would reverse a later rally instead.
 */
function undoIfStillLatest(after: ReturnType<typeof history>['present']): () => void {
  return () => {
    if (history().present === after) undoScoreAction();
    else
      notify.info('The score has changed since. Use Undo (Z) to step back one change at a time.');
  };
}

export async function resetMatch(): Promise<void> {
  const confirmed = await ask.confirm({
    title: 'Start a new match?',
    body: 'Points, sets won, set number and serve are reset to zero. Team names and colours stay. You can still Undo afterwards.',
    confirmLabel: 'Reset Score',
    tone: 'danger',
  });
  if (confirmed && scoreAction({ type: 'reset' }))
    notify.undoable('Score reset for a new match', { run: undoIfStillLatest(history().present) });
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export function recordStat(playerId: string, statId: string, delta: 1 | -1 = 1): void {
  const state = getState();
  const definition = definitionOf(teamOf(state.doc.show.data));
  if (!definition) return;
  const change = stepStat(
    definition,
    state.doc.show.data.event.stats,
    state.statLog,
    playerId,
    statId,
    delta,
  );
  if (!change.changed) return;
  setState({ statLog: change.log });
  setEvent((event) => ({ ...event, stats: change.stats }));
}

export function setStat(playerId: string, statId: string, value: number): void {
  const state = getState();
  const definition = definitionOf(teamOf(state.doc.show.data));
  if (!definition) return;
  const change = setStatValue(
    definition,
    state.doc.show.data.event.stats,
    state.statLog,
    playerId,
    statId,
    value,
  );
  if (!change.changed) return;
  setState({ statLog: change.log });
  setEvent((event) => ({ ...event, stats: change.stats }));
}

export function undoLastStat(): void {
  const state = getState();
  const change = undoStat(state.doc.show.data.event.stats, state.statLog);
  if (!change.changed) return;
  setState({ statLog: change.log });
  setEvent((event) => ({ ...event, stats: change.stats }));
}

/** Put a player into, or take them out of, tonight's membership of a group. */
export function setLiveMembership(groupId: string, playerId: string, member: boolean): boolean {
  const state = getState();
  const data = state.doc.show.data;
  const team = teamOf(data);
  const group = team?.groups.find((item) => item.id === groupId);
  if (!group) return false;
  const ids = effectiveGroupIds(data, group).slice();
  const index = ids.indexOf(playerId);
  if (member) {
    if (index >= 0) return true;
    if (group.maxPlayers !== undefined && ids.length >= group.maxPlayers) {
      notify.warning(`${group.name} already has ${group.maxPlayers}. Take someone out first.`);
      return false;
    }
    ids.push(playerId);
  } else {
    if (index < 0) return true;
    ids.splice(index, 1);
  }
  setEvent((event) => ({
    ...event,
    liveGroups: setLiveGroupPlayers(event.liveGroups, groupId, ids),
  }));
  return true;
}

/** Swap one player for another in tonight's group, keeping their place. */
export function substitute(groupId: string, outId: string, inId: string): void {
  const data = getState().doc.show.data;
  const group = teamOf(data)?.groups.find((item) => item.id === groupId);
  if (!group) return;
  const ids = effectiveGroupIds(data, group).slice();
  const index = ids.indexOf(outId);
  if (index < 0 || ids.includes(inId)) return;
  ids[index] = inId;
  setEvent((event) => ({
    ...event,
    liveGroups: setLiveGroupPlayers(event.liveGroups, groupId, ids),
  }));
}

/** Forget tonight's changes and use the saved group again. */
export function resetLiveMembership(groupId: string): void {
  setEvent((event) => {
    if (!(groupId in event.liveGroups)) return event;
    const liveGroups = { ...event.liveGroups };
    delete liveGroups[groupId];
    return { ...event, liveGroups };
  });
}

export function setStatsGroup(groupId: string | null): void {
  setState({ statsGroupId: groupId });
}
