import { describe, expect, it } from 'vitest';
import {
  applyScoreAction,
  createScoreHistory,
  defaultVolleyballScore,
  describeScoreChange,
  isMatchPoint,
  previewEndSet,
  reduceScore,
  setPointSide,
  undoDescription,
  undoScore,
} from '../src/core/score.js';

const base = () => ({
  ...defaultVolleyballScore(),
  home: { name: 'Wildcats', primaryColor: '#004b32' },
  away: { name: 'Eagles', primaryColor: '#9a1b2f' },
});

describe('rally scoring', () => {
  it('gives the point and the serve to the rally winner', () => {
    const after = reduceScore({ ...base(), serving: 'home' }, { type: 'rally', side: 'away' });
    expect(after).toMatchObject({ awayPoints: 1, serving: 'away' });
  });

  it('ignores rallies once the match is decided', () => {
    const final = { ...base(), homeSets: 3, homePoints: 25, awayPoints: 18 };
    expect(reduceScore(final, { type: 'rally', side: 'away' })).toBe(final);
  });

  it('is one undo step', () => {
    let history = createScoreHistory(base());
    history = applyScoreAction(history, { type: 'rally', side: 'home' });
    expect(undoDescription(history)).toBe('Wildcats +1 (1–0)');
    history = undoScore(history);
    expect(history.present).toMatchObject({ homePoints: 0, serving: null });
  });
});

describe('set and match point guidance', () => {
  it('spots set point and match point without deciding anything', () => {
    expect(setPointSide({ ...base(), homePoints: 24, awayPoints: 22 })).toBe('home');
    expect(setPointSide({ ...base(), homePoints: 24, awayPoints: 24 })).toBeNull();
    expect(isMatchPoint({ ...base(), homePoints: 24, awayPoints: 20, homeSets: 2 })).toBe(true);
    expect(isMatchPoint({ ...base(), homePoints: 24, awayPoints: 20, homeSets: 1 })).toBe(false);
  });

  it('uses the 15-point deciding set', () => {
    const decider = {
      ...base(),
      setNumber: 5,
      homeSets: 2,
      awaySets: 2,
      homePoints: 14,
      awayPoints: 10,
    };
    expect(setPointSide(decider)).toBe('home');
    expect(isMatchPoint(decider)).toBe(true);
  });
});

describe('End Set preview', () => {
  it('describes a regulation finish', () => {
    expect(previewEndSet({ ...base(), homePoints: 25, awayPoints: 23 })).toEqual({
      kind: 'ready',
      winner: 'home',
      regulation: true,
      endsMatch: false,
      winnerPoints: 25,
      loserPoints: 23,
    });
  });

  it('flags an unusual finish and a tie', () => {
    expect(previewEndSet({ ...base(), homePoints: 20, awayPoints: 18 })).toMatchObject({
      regulation: false,
    });
    expect(previewEndSet({ ...base(), homePoints: 20, awayPoints: 20 })).toEqual({ kind: 'tied' });
  });

  it('knows when ending the set ends the match', () => {
    const preview = previewEndSet({
      ...base(),
      homeSets: 2,
      homePoints: 25,
      awayPoints: 20,
      setNumber: 3,
    });
    expect(preview).toMatchObject({ kind: 'ready', endsMatch: true });
    expect(previewEndSet({ ...base(), homeSets: 3 })).toEqual({ kind: 'match-complete' });
  });
});

describe('score change descriptions', () => {
  it('names the change in operator language', () => {
    const start = { ...base(), homePoints: 25, awayPoints: 22 };
    expect(
      describeScoreChange(start, reduceScore(start, { type: 'end-set', winner: 'home' })),
    ).toBe('End set 1 (Wildcats 25–22)');
    expect(describeScoreChange(start, reduceScore(start, { type: 'swap-sides' }))).toBe(
      'Swap sides',
    );
    expect(describeScoreChange(start, reduceScore(start, { type: 'serve', side: 'away' }))).toBe(
      'Eagles serve',
    );
    const played = { ...base(), homeSets: 2, awaySets: 1, homePoints: 4, setNumber: 4 };
    expect(describeScoreChange(played, reduceScore(played, { type: 'reset' }))).toBe('Reset match');
    expect(
      describeScoreChange(start, reduceScore(start, { type: 'point', side: 'away', delta: -1 })),
    ).toBe('Eagles −1 (25–21)');
  });
});
