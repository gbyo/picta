import { describe, expect, it } from 'vitest';
import {
  MAX_STAT,
  STAT_KEYS,
  adjustStat,
  emptyStats,
  formatHalves,
  formatHittingPercentage,
  hittingPercentage,
  makePlayer,
  playerLabel,
  points,
  recordAttack,
  removePlayer,
  resetStats,
  statSummary,
  takeoverStats,
  teamTotals,
  totalBlocks,
  undoAttack,
  type PlayerStats,
} from '../src/core/stats.js';

const stats = (over: Partial<PlayerStats> = {}): PlayerStats => ({ ...emptyStats(), ...over });

describe('creating players', () => {
  it('trims input and starts every counter at zero', () => {
    const player = makePlayer('  7 ', '  Avery Chen ', ' OH ');
    expect(player.number).toBe('7');
    expect(player.name).toBe('Avery Chen');
    expect(player.position).toBe('OH');
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

describe('hitting percentage', () => {
  it('is kills minus errors over attempts', () => {
    expect(hittingPercentage(stats({ kills: 10, attackErrors: 2, attempts: 25 }))).toBeCloseTo(
      0.32,
    );
  });

  it('has no value at all before a first attack', () => {
    // Not zero: `.000` would claim they attacked and failed.
    expect(hittingPercentage(stats())).toBeNull();
    expect(formatHittingPercentage(null)).toBe('—');
  });

  it('is legitimately negative when errors outnumber kills', () => {
    expect(hittingPercentage(stats({ kills: 1, attackErrors: 4, attempts: 10 }))).toBeCloseTo(-0.3);
  });

  it('formats the way a box score does', () => {
    expect(formatHittingPercentage(0.312)).toBe('.312');
    expect(formatHittingPercentage(0)).toBe('.000');
    expect(formatHittingPercentage(-0.045)).toBe('-.045');
    expect(formatHittingPercentage(1)).toBe('1.000');
    expect(formatHittingPercentage(0.5)).toBe('.500');
  });
});

describe('blocks and points', () => {
  it('counts an assisted block as half', () => {
    expect(totalBlocks(stats({ blockSolos: 2, blockAssists: 3 }))).toBe(3.5);
    expect(formatHalves(3.5)).toBe('3.5');
    expect(formatHalves(4)).toBe('4');
  });

  it('adds kills, aces and blocks', () => {
    expect(points(stats({ kills: 10, aces: 2, blockSolos: 1, blockAssists: 2 }))).toBe(14);
  });

  it('does not subtract errors from points', () => {
    expect(points(stats({ kills: 5, attackErrors: 3, serviceErrors: 2 }))).toBe(5);
  });
});

describe('adjusting a counter', () => {
  const roster = [makePlayer('7', 'Avery'), makePlayer('3', 'Jordan')];
  const id = roster[0]!.id;

  it('increments and decrements', () => {
    let next = adjustStat(roster, id, 'digs', 1);
    expect(next[0]!.stats.digs).toBe(1);
    next = adjustStat(next, id, 'digs', -1);
    expect(next[0]!.stats.digs).toBe(0);
  });

  it('never goes below zero', () => {
    const next = adjustStat(roster, id, 'digs', -5);
    expect(next[0]!.stats.digs).toBe(0);
  });

  it('clamps at the ceiling', () => {
    const next = adjustStat(roster, id, 'digs', MAX_STAT + 100);
    expect(next[0]!.stats.digs).toBe(MAX_STAT);
  });

  it('touches nobody else', () => {
    const next = adjustStat(roster, id, 'digs', 1);
    expect(next[1]!.stats.digs).toBe(0);
    expect(next[1]).toBe(roster[1]);
  });

  it('ignores an unknown id rather than throwing mid-game', () => {
    expect(adjustStat(roster, 'nope', 'digs', 1)).toEqual(roster);
  });

  it('does not mutate the input', () => {
    adjustStat(roster, id, 'digs', 1);
    expect(roster[0]!.stats.digs).toBe(0);
  });
});

describe('recording an attack', () => {
  const roster = [makePlayer('7', 'Avery')];
  const id = roster[0]!.id;

  it('counts the attempt along with the kill', () => {
    const next = recordAttack(roster, id, 'kill');
    expect(next[0]!.stats.kills).toBe(1);
    expect(next[0]!.stats.attempts).toBe(1);
  });

  it('counts the attempt along with the error', () => {
    const next = recordAttack(roster, id, 'error');
    expect(next[0]!.stats.attackErrors).toBe(1);
    expect(next[0]!.stats.attempts).toBe(1);
  });

  it('records an attack that was neither', () => {
    const next = recordAttack(roster, id, 'attempt');
    expect(next[0]!.stats.attempts).toBe(1);
    expect(next[0]!.stats.kills).toBe(0);
    expect(next[0]!.stats.attackErrors).toBe(0);
  });

  it('produces a hitting percentage that agrees with the counters', () => {
    let next = roster;
    for (let i = 0; i < 10; i += 1) next = recordAttack(next, id, 'kill');
    for (let i = 0; i < 2; i += 1) next = recordAttack(next, id, 'error');
    for (let i = 0; i < 13; i += 1) next = recordAttack(next, id, 'attempt');
    const s = next[0]!.stats;
    expect(s.attempts).toBe(25);
    expect(hittingPercentage(s)).toBeCloseTo(0.32);
  });

  it('undoes cleanly', () => {
    const next = undoAttack(recordAttack(roster, id, 'kill'), id, 'kill');
    expect(next[0]!.stats.kills).toBe(0);
    expect(next[0]!.stats.attempts).toBe(0);
  });

  it('cannot be undone past zero', () => {
    const next = undoAttack(roster, id, 'kill');
    expect(next[0]!.stats.kills).toBe(0);
    expect(next[0]!.stats.attempts).toBe(0);
  });
});

describe('roster operations', () => {
  it('removes one player and leaves the rest', () => {
    const roster = [makePlayer('1', 'A'), makePlayer('2', 'B')];
    const next = removePlayer(roster, roster[0]!.id);
    expect(next.map((p) => p.name)).toEqual(['B']);
  });

  it('clears every counter without losing the roster', () => {
    const roster = adjustStat([makePlayer('1', 'A')], '', 'digs', 1);
    const seeded = adjustStat(roster, roster[0]!.id, 'digs', 4);
    const cleared = resetStats(seeded);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]!.name).toBe('A');
    expect(cleared[0]!.stats.digs).toBe(0);
  });

  it('sums team totals across every counter', () => {
    const a = makePlayer('1', 'A');
    const b = makePlayer('2', 'B');
    let roster = adjustStat([a, b], a.id, 'kills', 5);
    roster = adjustStat(roster, b.id, 'kills', 3);
    roster = adjustStat(roster, b.id, 'digs', 2);
    const totals = teamTotals(roster);
    expect(totals.kills).toBe(8);
    expect(totals.digs).toBe(2);
    expect(totals.aces).toBe(0);
  });
});

describe('labels and summaries', () => {
  it('reads as a jersey number and a name', () => {
    expect(playerLabel(makePlayer('7', 'Avery Chen'))).toBe('#7 Avery Chen');
  });

  it('drops the number when there is not one', () => {
    expect(playerLabel(makePlayer('', 'Avery Chen'))).toBe('Avery Chen');
  });

  it('summarises without a hitting percentage before any attack', () => {
    expect(statSummary(emptyStats())).toBe('0 K · 0 A · 0 D · 0 SA');
  });

  it('adds the hitting percentage once there is one', () => {
    expect(statSummary(stats({ kills: 10, attackErrors: 2, attempts: 25 }))).toContain('.320');
  });
});

describe('what goes on the takeover card', () => {
  it('stays short enough to read across a room', () => {
    const card = takeoverStats(stats({ kills: 12, assists: 4, digs: 6, aces: 2 }));
    expect(card).toHaveLength(4);
    expect(card.map((s) => s.label)).toEqual(['Kills', 'Assists', 'Digs', 'Aces']);
  });

  it('adds blocks and hitting only when they mean something', () => {
    const card = takeoverStats(
      stats({ kills: 12, attackErrors: 2, attempts: 30, blockSolos: 1, blockAssists: 1 }),
    );
    const labels = card.map((s) => s.label);
    expect(labels).toContain('Blocks');
    expect(labels).toContain('Hitting');
    expect(card.find((s) => s.label === 'Blocks')?.value).toBe('1.5');
    expect(card.find((s) => s.label === 'Hitting')?.value).toBe('.333');
    // Never more than fits on one card.
    expect(card.length).toBeLessThanOrEqual(6);
  });
});
