/** Pure, operator-driven volleyball score state and undo history. */

import type { MatchFormat, ScoreSide, Team, VolleyballScoreState } from './domain.js';

export type ScoreAction =
  /** One rally won: the winner scores and, under rally scoring, serves next. */
  | { type: 'rally'; side: ScoreSide }
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
    case 'rally': {
      if (matchWinner(score)) return state;
      const key = action.side === 'home' ? 'homePoints' : 'awayPoints';
      score[key] += 1;
      score.serving = action.side;
      return score;
    }
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

export function otherSide(side: ScoreSide): ScoreSide {
  return side === 'home' ? 'away' : 'home';
}

export function sidePoints(score: VolleyballScoreState, side: ScoreSide): number {
  return side === 'home' ? score.homePoints : score.awayPoints;
}

export function sideSets(score: VolleyballScoreState, side: ScoreSide): number {
  return side === 'home' ? score.homeSets : score.awaySets;
}

/** Guidance only: the side that would win the set with one more rally. */
export function setPointSide(score: VolleyballScoreState): ScoreSide | null {
  if (matchWinner(score)) return null;
  const target = setPointTarget(score);
  for (const side of ['home', 'away'] as const) {
    const mine = sidePoints(score, side) + 1;
    const theirs = sidePoints(score, otherSide(side));
    if (mine >= target && mine - theirs >= 2) return side;
  }
  return null;
}

/** True when the set point would also decide the match. */
export function isMatchPoint(score: VolleyballScoreState): boolean {
  const side = setPointSide(score);
  if (!side) return false;
  const needed = Math.ceil(matchSetLimit(score) / 2);
  return sideSets(score, side) + 1 >= needed;
}

/** What End Set would do right now, or why it cannot. */
export type EndSetPreview =
  | { kind: 'match-complete' }
  | { kind: 'tied' }
  | {
      kind: 'ready';
      winner: ScoreSide;
      regulation: boolean;
      endsMatch: boolean;
      winnerPoints: number;
      loserPoints: number;
    };

export function previewEndSet(score: VolleyballScoreState): EndSetPreview {
  if (matchWinner(score)) return { kind: 'match-complete' };
  const winner = higherScoringSide(score);
  if (!winner) return { kind: 'tied' };
  const after = reduceScore(score, { type: 'end-set', winner });
  return {
    kind: 'ready',
    winner,
    regulation: regulationSetWinner(score) === winner,
    endsMatch: matchWinner(after) !== null,
    winnerPoints: sidePoints(score, winner),
    loserPoints: sidePoints(score, otherSide(winner)),
  };
}

/**
 * Describe the change between two score states in operator language, so Undo
 * can say exactly what it will reverse. Returns a generic label when several
 * fields changed at once.
 */
export function describeScoreChange(
  before: VolleyballScoreState,
  after: VolleyballScoreState,
): string {
  const name = (side: ScoreSide, state: VolleyballScoreState) => state[side].name;
  if (
    before.home.name === after.away.name &&
    before.away.name === after.home.name &&
    before.home.name !== before.away.name
  )
    return 'Swap sides';
  const setsChanged = before.homeSets !== after.homeSets || before.awaySets !== after.awaySets;
  const pointsReset =
    after.homePoints === 0 &&
    after.awayPoints === 0 &&
    (before.homePoints !== 0 || before.awayPoints !== 0);
  if (setsChanged && after.homeSets === 0 && after.awaySets === 0 && after.setNumber === 1)
    return 'Reset match';
  if (setsChanged && (pointsReset || after.setNumber !== before.setNumber || matchWinner(after))) {
    const winner = after.homeSets > before.homeSets ? 'home' : 'away';
    return `End set ${before.setNumber} (${name(winner, before)} ${sidePoints(before, winner)}–${sidePoints(before, otherSide(winner))})`;
  }
  if (setsChanged) {
    const side = after.homeSets !== before.homeSets ? 'home' : 'away';
    return `${name(side, after)} sets → ${sideSets(after, side)}`;
  }
  if (pointsReset && after.setNumber === 1 && after.homeSets === 0 && after.awaySets === 0)
    return 'Reset match';
  for (const side of ['home', 'away'] as const) {
    const delta = sidePoints(after, side) - sidePoints(before, side);
    if (delta !== 0) {
      const sign = delta > 0 ? '+' : '−';
      return `${name(side, after)} ${sign}${Math.abs(delta)} (${after.homePoints}–${after.awayPoints})`;
    }
  }
  if (before.serving !== after.serving)
    return after.serving ? `${name(after.serving, after)} serve` : 'Clear serve';
  if (before.setNumber !== after.setNumber) return `Set number → ${after.setNumber}`;
  if (before.matchFormat !== after.matchFormat)
    return after.matchFormat === 'best-of-3' ? 'Best of 3' : 'Best of 5';
  if (before.home.name !== after.home.name || before.away.name !== after.away.name)
    return 'Team name';
  if (
    before.home.primaryColor !== after.home.primaryColor ||
    before.away.primaryColor !== after.away.primaryColor
  )
    return 'Team colour';
  return 'Score change';
}

/** The description of what Undo would reverse, or null when there is nothing. */
export function undoDescription(history: ScoreHistory): string | null {
  const previous = history.past.at(-1);
  return previous ? describeScoreChange(previous, history.present) : null;
}
