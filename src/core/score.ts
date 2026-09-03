/** Pure, operator-driven volleyball score state and undo history. */

import type { MatchFormat, ScoreSide, Team, VolleyballScoreState } from './domain.js';

export type ScoreAction =
  | { type: 'point'; side: ScoreSide; delta: 1 | -1 }
  | { type: 'serve'; side: ScoreSide | null }
  | { type: 'set-number'; value: number }
  | { type: 'sets-won'; side: ScoreSide; value: number }
  | { type: 'end-set'; winner?: ScoreSide }
  | { type: 'swap-sides' }
  | { type: 'team-name'; side: ScoreSide; value: string }
  | { type: 'team-color'; side: ScoreSide; value: string }
  | { type: 'match-format'; value: MatchFormat }
  | { type: 'reset' };

export interface ScoreHistory {
  present: VolleyballScoreState;
  past: VolleyballScoreState[];
}

function cloneScore(score: VolleyballScoreState): VolleyballScoreState {
  return { ...score, home: { ...score.home }, away: { ...score.away } };
}

export function defaultVolleyballScore(
  team?: Pick<Team, 'name' | 'colors'>,
  loadedTeamSide: ScoreSide = 'home',
): VolleyballScoreState {
  const loaded = team
    ? { name: team.name, primaryColor: team.colors.primary }
    : { name: loadedTeamSide === 'home' ? 'Home' : 'Away', primaryColor: '#20242b' };
  const opponent = { name: 'Opponent', primaryColor: '#4b5563' };
  return {
    sport: 'volleyball',
    home: loadedTeamSide === 'home' ? loaded : opponent,
    away: loadedTeamSide === 'away' ? loaded : opponent,
    homePoints: 0,
    awayPoints: 0,
    homeSets: 0,
    awaySets: 0,
    setNumber: 1,
    serving: null,
    matchFormat: 'best-of-5',
  };
}

export function higherScoringSide(score: VolleyballScoreState): ScoreSide | null {
  if (score.homePoints === score.awayPoints) return null;
  return score.homePoints > score.awayPoints ? 'home' : 'away';
}

export function matchSetLimit(score: VolleyballScoreState): 3 | 5 {
  return score.matchFormat === 'best-of-3' ? 3 : 5;
}

export function matchWinner(score: VolleyballScoreState): ScoreSide | null {
  const needed = Math.ceil(matchSetLimit(score) / 2);
  if (score.homeSets >= needed && score.homeSets > score.awaySets) return 'home';
  if (score.awaySets >= needed && score.awaySets > score.homeSets) return 'away';
  return null;
}

export function setPointTarget(score: VolleyballScoreState): 15 | 25 {
  return score.setNumber === matchSetLimit(score) ? 15 : 25;
}

/** Guidance only: the operator confirms set completion, including local variants. */
export function regulationSetWinner(score: VolleyballScoreState): ScoreSide | null {
  const leader = higherScoringSide(score);
  const highest = Math.max(score.homePoints, score.awayPoints);
  return highest >= setPointTarget(score) && Math.abs(score.homePoints - score.awayPoints) >= 2
    ? leader
    : null;
}

export function reduceScore(
  state: VolleyballScoreState,
  action: ScoreAction,
): VolleyballScoreState {
  const score = cloneScore(state);
  switch (action.type) {
    case 'point': {
      const key = action.side === 'home' ? 'homePoints' : 'awayPoints';
      score[key] = Math.max(0, score[key] + action.delta);
      return score;
    }
    case 'serve':
      score.serving = action.side;
      return score;
    case 'set-number':
      score.setNumber = Math.min(matchSetLimit(score), Math.max(1, Math.floor(action.value)));
      return score;
    case 'sets-won': {
      const key = action.side === 'home' ? 'homeSets' : 'awaySets';
      score[key] = Math.max(0, Math.floor(action.value));
      return score;
    }
    case 'end-set': {
      if (matchWinner(score)) return state;
      const winner = action.winner ?? higherScoringSide(score);
      if (!winner) return state;
      if (winner === 'home') score.homeSets += 1;
      else score.awaySets += 1;
      // Preserve the final rally score and final set number on the audience TV.
      // Do not roll a completed best-of-five match into a nonexistent sixth set.
      if (matchWinner(score)) {
        score.serving = null;
        return score;
      }
      score.homePoints = 0;
      score.awayPoints = 0;
      score.setNumber = Math.min(matchSetLimit(score), score.setNumber + 1);
      score.serving = null;
      return score;
    }
    case 'swap-sides':
      return {
        ...score,
        home: score.away,
        away: score.home,
        homePoints: score.awayPoints,
        awayPoints: score.homePoints,
        homeSets: score.awaySets,
        awaySets: score.homeSets,
        serving: score.serving === 'home' ? 'away' : score.serving === 'away' ? 'home' : null,
      };
    case 'team-name':
      score[action.side] = {
        ...score[action.side],
        name: action.value.trim() || (action.side === 'home' ? 'Home' : 'Opponent'),
      };
      return score;
    case 'team-color':
      score[action.side] = { ...score[action.side], primaryColor: action.value };
      return score;
    case 'match-format':
      score.matchFormat = action.value;
      score.setNumber = Math.min(score.setNumber, matchSetLimit(score));
      return score;
    case 'reset': {
      score.homePoints = 0;
      score.awayPoints = 0;
      score.homeSets = 0;
      score.awaySets = 0;
      score.setNumber = 1;
      score.serving = null;
      return score;
    }
  }
}

export const scoreReducer = reduceScore;

export function createScoreHistory(score: VolleyballScoreState): ScoreHistory {
  return { present: cloneScore(score), past: [] };
}

export function applyScoreAction(history: ScoreHistory, action: ScoreAction): ScoreHistory {
  const next = reduceScore(history.present, action);
  if (next === history.present) return history;
  return { present: next, past: [...history.past.slice(-49), cloneScore(history.present)] };
}

export function undoScore(history: ScoreHistory): ScoreHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return { present: cloneScore(previous), past: history.past.slice(0, -1) };
}

export function resetMatchScore(score: VolleyballScoreState): VolleyballScoreState {
  return reduceScore(score, { type: 'reset' });
}
