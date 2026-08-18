import { describe, expect, it } from 'vitest';
import {
  MAX_STAT,
  STAT_KEYS,
  STAT_LABELS,
  adjustStat,
  emptyStats,
  findPlayer,
  makePlayer,
  playerLabel,
  removePlayer,
  resetStats,
  setStat,
  takeoverStats,
  teamTotals,
} from '../src/core/stats.js';

describe('the four counters', () => {
  it('is exactly kills, assists, digs and blocks', () => {
    expect([...STAT_KEYS]).toEqual(['kills', 'assists', 'digs', 'blocks']);
  });

  it('labels them with the box-score initials, in that order', () => {
    expect(STAT_KEYS.map((key) => STAT_LABELS[key].short)).toEqual(['K', 'A', 'D', 'B']);
  });

  it('starts every counter at zero', () => {
    expect(emptyStats()).toEqual({ kills: 0, assists: 0, digs: 0, blocks: 0 });
  });
});

describe('creating players', () => {
  it('trims input and starts on the bench with nothing recorded', () => {
    const player = makePlayer('  7 ', '  Avery Chen ', ' OH ');
    expect(player.number).toBe('7');
    expect(player.name).toBe('Avery Chen');
    expect(player.position).toBe('OH');
    expect(player.onCourt).toBe(false);
    for (const key of STAT_KEYS) expect(player.stats[key]).toBe(0);
  });

  it('gives every player a distinct id', () => {
    const ids = new Set(Array.from({ length: 50 }, () => makePlayer('1', 'A').id));
    expect(ids.size).toBe(50);
  });

  it('keeps jersey numbers as text so 0 and 00 stay different players', () => {
    expect(makePlayer('0', 'A').number).toBe('0');
    expect(makePlayer('00', 'B').number).toBe('00');
  });
});

describe('setting a counter', () => {
  const roster = [makePlayer('7', 'Avery'), makePlayer('3', 'Jordan')];
  const id = roster[0]!.id;

  it('takes a typed value', () => {
    expect(setStat(roster, id, 'digs', 14)[0]!.stats.digs).toBe(14);
  });

  it('never goes below zero', () => {
    expect(setStat(roster, id, 'digs', -5)[0]!.stats.digs).toBe(0);
  });

  it('clamps at the ceiling', () => {
    expect(setStat(roster, id, 'digs', MAX_STAT + 100)[0]!.stats.digs).toBe(MAX_STAT);
  });

  it('ignores a half-typed or unusable number rather than throwing mid-match', () => {
    expect(setStat(roster, id, 'digs', Number.NaN)).toEqual(roster);
    expect(setStat(roster, id, 'digs', Number.POSITIVE_INFINITY)).toEqual(roster);
  });

  it('floors a fractional value: a counter counts whole events', () => {
    expect(setStat(roster, id, 'blocks', 2.7)[0]!.stats.blocks).toBe(2);
  });

  it('touches nobody else', () => {
    const next = setStat(roster, id, 'digs', 3);
    expect(next[1]!.stats.digs).toBe(0);
    expect(next[1]).toBe(roster[1]);
  });

  it('ignores an unknown id', () => {
    expect(setStat(roster, 'nope', 'digs', 4)).toEqual(roster);
  });

  it('does not mutate the input', () => {
    setStat(roster, id, 'digs', 9);
    expect(roster[0]!.stats.digs).toBe(0);
  });
});

describe('nudging a counter', () => {
  const roster = [makePlayer('7', 'Avery')];
  const id = roster[0]!.id;

  it('steps up and down', () => {
    let next = adjustStat(roster, id, 'kills', 1);
    expect(next[0]!.stats.kills).toBe(1);
    next = adjustStat(next, id, 'kills', -1);
    expect(next[0]!.stats.kills).toBe(0);
  });

  it('cannot be nudged below zero', () => {
    expect(adjustStat(roster, id, 'kills', -1)[0]!.stats.kills).toBe(0);
  });
});

describe('roster operations', () => {
  it('finds a player by id', () => {
    const roster = [makePlayer('1', 'A'), makePlayer('2', 'B')];
    expect(findPlayer(roster, roster[1]!.id)?.name).toBe('B');
    expect(findPlayer(roster, 'nope')).toBeNull();
  });

  it('removes one player and leaves the rest', () => {
    const roster = [makePlayer('1', 'A'), makePlayer('2', 'B')];
    expect(removePlayer(roster, roster[0]!.id).map((p) => p.name)).toEqual(['B']);
  });

  it('clears counters, keeps the roster and keeps the lineup', () => {
    const roster = [{ ...makePlayer('1', 'A'), onCourt: true }];
    const seeded = setStat(roster, roster[0]!.id, 'digs', 4);
    const cleared = resetStats(seeded);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]!.name).toBe('A');
    expect(cleared[0]!.stats.digs).toBe(0);
    // Resetting for a new match should not empty the court.
    expect(cleared[0]!.onCourt).toBe(true);
  });

  it('sums team totals across every counter', () => {
    const a = makePlayer('1', 'A');
    const b = makePlayer('2', 'B');
    let roster = setStat([a, b], a.id, 'kills', 5);
    roster = setStat(roster, b.id, 'kills', 3);
    roster = setStat(roster, b.id, 'digs', 2);
    const totals = teamTotals(roster);
    expect(totals.kills).toBe(8);
    expect(totals.digs).toBe(2);
    expect(totals.assists).toBe(0);
  });
});

describe('labels', () => {
  it('reads as a jersey number and a name', () => {
    expect(playerLabel(makePlayer('7', 'Avery Chen'))).toBe('#7 Avery Chen');
  });

  it('drops the number when there is not one', () => {
    expect(playerLabel(makePlayer('', 'Avery Chen'))).toBe('Avery Chen');
  });
});

describe('what goes on the takeover card', () => {
  it('is the same four figures, in the same order, spelled out', () => {
    const card = takeoverStats({ kills: 12, assists: 4, digs: 6, blocks: 2 });
    expect(card).toEqual([
      { label: 'Kills', value: '12' },
      { label: 'Assists', value: '4' },
      { label: 'Digs', value: '6' },
      { label: 'Blocks', value: '2' },
    ]);
  });

  it('shows zeroes rather than hiding a figure', () => {
    // A card with a missing column reads as a mistake; a zero reads as a zero.
    expect(takeoverStats(emptyStats()).map((s) => s.value)).toEqual(['0', '0', '0', '0']);
  });
});
