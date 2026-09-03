import { describe, expect, it } from 'vitest';
import {
  applyScoreAction,
  createScoreHistory,
  defaultVolleyballScore,
  reduceScore,
  matchWinner,
  setPointTarget,
  regulationSetWinner,
  undoScore,
} from '../src/core/score.js';

describe('volleyball score reducer', () => {
  it('uses 25-point normal sets and a 15-point deciding set in either match format', () => {
    const base = defaultVolleyballScore();
    expect(setPointTarget(base)).toBe(25);
    expect(setPointTarget({ ...base, setNumber: 4 })).toBe(25);
    expect(setPointTarget({ ...base, setNumber: 5 })).toBe(15);
    expect(setPointTarget({ ...base, matchFormat: 'best-of-3', setNumber: 3 })).toBe(15);
  });

  it('requires a two-point margin even above the point target', () => {
    const base = defaultVolleyballScore();
    expect(regulationSetWinner({ ...base, homePoints: 25, awayPoints: 24 })).toBeNull();
    expect(regulationSetWinner({ ...base, homePoints: 31, awayPoints: 29 })).toBe('home');
    expect(regulationSetWinner({ ...base, setNumber: 5, homePoints: 15, awayPoints: 13 })).toBe(
      'home',
    );
  });

  it.each(['best-of-3', 'best-of-5'] as const)(
    'keeps the final score visible for %s and supports Undo',
    (matchFormat) => {
      const lastSet = matchFormat === 'best-of-3' ? 3 : 5;
      const setsBeforeWin = matchFormat === 'best-of-3' ? 1 : 2;
      const finalRally = {
        ...defaultVolleyballScore(),
        matchFormat,
        setNumber: lastSet,
        homeSets: setsBeforeWin,
        awaySets: setsBeforeWin,
        homePoints: 15,
        awayPoints: 13,
      };
      const ended = applyScoreAction(createScoreHistory(finalRally), { type: 'end-set' });
      expect(matchWinner(ended.present)).toBe('home');
      expect(ended.present).toMatchObject({
        setNumber: lastSet,
        homePoints: 15,
        awayPoints: 13,
        homeSets: setsBeforeWin + 1,
      });
      expect(reduceScore(ended.present, { type: 'end-set' })).toBe(ended.present);
      expect(undoScore(ended).present).toEqual(finalRally);
    },
  );
  it('adds, decrements, and never goes below zero', () => {
    const base = defaultVolleyballScore();
    expect(reduceScore(base, { type: 'point', side: 'home', delta: 1 }).homePoints).toBe(1);
    expect(reduceScore(base, { type: 'point', side: 'away', delta: -1 }).awayPoints).toBe(0);
  });

  it('updates serving, set number, and sets won', () => {
    let score = reduceScore(defaultVolleyballScore(), { type: 'serve', side: 'away' });
    score = reduceScore(score, { type: 'set-number', value: 3 });
    score = reduceScore(score, { type: 'sets-won', side: 'home', value: 2 });
    expect(score.serving).toBe('away');
    expect(score.setNumber).toBe(3);
    expect(score.homeSets).toBe(2);
  });

  it('ends a decided set, clears serve, and refuses to guess a tie', () => {
    const tied = defaultVolleyballScore();
    expect(reduceScore(tied, { type: 'end-set' })).toBe(tied);
    const played = { ...tied, homePoints: 25, awayPoints: 18, serving: 'home' as const };
    const ended = reduceScore(played, { type: 'end-set' });
    expect(ended).toMatchObject({
      homeSets: 1,
      homePoints: 0,
      awayPoints: 0,
      setNumber: 2,
      serving: null,
    });
  });

  it('undoes an accidental point and End Set', () => {
    let history = createScoreHistory({
      ...defaultVolleyballScore(),
      homePoints: 25,
      awayPoints: 18,
    });
    history = applyScoreAction(history, { type: 'end-set' });
    history = undoScore(history);
    expect(history.present).toMatchObject({
      homePoints: 25,
      awayPoints: 18,
      homeSets: 0,
      setNumber: 1,
    });
  });

  it('initializes display values from a loaded team', () => {
    const score = defaultVolleyballScore({
      name: 'Ninety Six',
      colors: { primary: '#123456', secondary: '#fff' },
    });
    expect(score.home).toEqual({ name: 'Ninety Six', primaryColor: '#123456' });
    expect(score.away.name).toBe('Opponent');
  });
});
