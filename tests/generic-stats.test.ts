import { describe, expect, it } from 'vitest';
import {
  emptyRawStats,
  getSportDefinition,
  recordStat,
  volleyballDerivedStats,
} from '../src/core/sports.js';

describe('generic sport statistics', () => {
  it('uses definitions for non-volleyball boards', () => {
    expect(getSportDefinition('basketball').defaultBoardStats).toEqual([
      'points',
      'rebounds',
      'assists',
      'steals',
    ]);
    expect(getSportDefinition('football').stats.map((stat) => stat.id)).toContain('tackles');
  });

  it('preserves volleyball compound attempt actions and derived values', () => {
    const definition = getSportDefinition('volleyball');
    let stats = emptyRawStats(definition);
    stats = recordStat(definition, stats, 'kills');
    stats = recordStat(definition, stats, 'attackErrors', 2);
    expect(stats.kills).toBe(1);
    expect(stats.attackErrors).toBe(2);
    expect(stats.attempts).toBe(3);
    expect(
      volleyballDerivedStats({ ...stats, blockSolos: 1, blockAssists: 2, aces: 1 })
        .hittingPercentage,
    ).toBeCloseTo(-1 / 3);
    expect(volleyballDerivedStats({ blockSolos: 1, blockAssists: 2 }).totalBlocks).toBe(2);
    expect(volleyballDerivedStats({}).hittingPercentage).toBeNull();
  });

  it('clamps generic counters at zero and the safe ceiling', () => {
    const definition = getSportDefinition('basketball');
    const zero = recordStat(definition, emptyRawStats(definition), 'points', -4);
    expect(zero.points).toBe(0);
    const high = recordStat(definition, emptyRawStats(definition), 'points', 100000);
    expect(high.points).toBe(9999);
  });
});
