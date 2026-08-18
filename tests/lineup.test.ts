import { describe, expect, it } from 'vitest';
import {
  BOARD_COLUMNS,
  LINEUP_SIZE,
  boardRows,
  lineupIsFull,
  onCourt,
  onCourtCount,
  setOnCourt,
  tickIsSubstitution,
} from '../src/core/lineup.js';
import { makePlayer, setStat, type Player } from '../src/core/stats.js';

/** A roster of `n` players, the first `on` of them on the court. */
function roster(n: number, on = 0): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    ...makePlayer(String(i + 1), `Player ${i + 1}`),
    onCourt: i < on,
  }));
}

describe('the six on the court', () => {
  it('is six, because volleyball is', () => {
    expect(LINEUP_SIZE).toBe(6);
  });

  it('counts and lists them', () => {
    const squad = roster(10, 6);
    expect(onCourtCount(squad)).toBe(6);
    expect(onCourt(squad)).toHaveLength(6);
    expect(lineupIsFull(squad)).toBe(true);
  });

  it('is not full below six', () => {
    expect(lineupIsFull(roster(10, 5))).toBe(false);
  });
});

describe('ticking a player on or off', () => {
  it('ticks a bench player on', () => {
    const squad = roster(10, 3);
    const result = setOnCourt(squad, squad[5]!.id, true);
    expect(result.changed).toBe(true);
    expect(onCourtCount(result.roster)).toBe(4);
  });

  it('ticks an on-court player off', () => {
    const squad = roster(10, 6);
    const result = setOnCourt(squad, squad[0]!.id, false);
    expect(result.changed).toBe(true);
    expect(onCourtCount(result.roster)).toBe(5);
  });

  it('refuses a seventh rather than quietly dropping someone', () => {
    const squad = roster(10, 6);
    const result = setOnCourt(squad, squad[7]!.id, true);
    expect(result.changed).toBe(false);
    expect(onCourtCount(result.roster)).toBe(6);
    expect(result.roster[7]!.onCourt).toBe(false);
  });

  it('is a no-op when the box is already in that state', () => {
    const squad = roster(10, 6);
    expect(setOnCourt(squad, squad[0]!.id, true).changed).toBe(false);
    expect(setOnCourt(squad, squad[7]!.id, false).changed).toBe(false);
  });

  it('ignores an unknown id', () => {
    expect(setOnCourt(roster(10, 0), 'nobody', true).changed).toBe(false);
  });

  it('does not mutate the input', () => {
    const squad = roster(10, 0);
    setOnCourt(squad, squad[0]!.id, true);
    expect(squad[0]!.onCourt).toBe(false);
  });

  it('keeps the incoming player’s existing stats', () => {
    let squad = roster(10, 5);
    const incoming = squad[8]!;
    squad = setStat(squad, incoming.id, 'kills', 4);
    const result = setOnCourt(squad, incoming.id, true);
    expect(result.roster.find((p) => p.id === incoming.id)!.stats.kills).toBe(4);
  });

  it('allows the off-then-on sequence a real substitution uses', () => {
    const squad = roster(10, 6);
    const off = setOnCourt(squad, squad[2]!.id, false);
    expect(off.changed).toBe(true);
    const on = setOnCourt(off.roster, squad[8]!.id, true);
    expect(on.changed).toBe(true);
    expect(onCourtCount(on.roster)).toBe(6);
    expect(on.roster.find((p) => p.id === squad[2]!.id)!.onCourt).toBe(false);
    expect(on.roster.find((p) => p.id === squad[8]!.id)!.onCourt).toBe(true);
  });
});

describe('which ticks put a card on the screen', () => {
  it('does not, while the starting six is still being set', () => {
    // Otherwise ticking in a lineup before the match fires six cards in a row.
    expect(tickIsSubstitution(false)).toBe(false);
  });

  it('does, once a starting six has been set', () => {
    expect(tickIsSubstitution(true)).toBe(true);
  });
});

describe('the on-court panel rows', () => {
  it('carries the four figures asked for, pre-formatted', () => {
    let squad = roster(8, 6);
    const first = squad[0]!;
    squad = setStat(squad, first.id, 'kills', 12);
    squad = setStat(squad, first.id, 'assists', 4);
    squad = setStat(squad, first.id, 'digs', 6);
    squad = setStat(squad, first.id, 'blocks', 2);

    const rows = boardRows(squad);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({
      number: '1',
      name: 'Player 1',
      kills: '12',
      assists: '4',
      digs: '6',
      blocks: '2',
    });
  });

  it('lists only the players on the court, in roster order', () => {
    const squad = roster(10, 0);
    const chosen = new Set([squad[9]!.id, squad[4]!.id, squad[1]!.id]);
    const withLineup = squad.map((p) => (chosen.has(p.id) ? { ...p, onCourt: true } : p));
    expect(boardRows(withLineup).map((r) => r.name)).toEqual(['Player 2', 'Player 5', 'Player 10']);
  });

  it('is empty before a lineup is set', () => {
    expect(boardRows(roster(10, 0))).toEqual([]);
  });

  it('never returns more rows than the panel has room for', () => {
    // Defensive: a hand-edited .picta could mark more than six on court.
    expect(boardRows(roster(10, 9))).toHaveLength(LINEUP_SIZE);
  });

  it('has column headings matching the row fields, in order', () => {
    expect(BOARD_COLUMNS.map((c) => c.short)).toEqual(['K', 'A', 'D', 'B']);
    expect(BOARD_COLUMNS.map((c) => c.key)).toEqual(['kills', 'assists', 'digs', 'blocks']);
  });
});
