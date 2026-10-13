import { describe, expect, it } from 'vitest';
import { sportDefinition } from '../src/core/sports.js';
import {
  emptyStatLog,
  lastStatEntry,
  pruneStatLog,
  setStatValue,
  stepStat,
  undoStat,
} from '../src/core/stat-log.js';

const volleyball = sportDefinition('volleyball');

describe('live stat log', () => {
  it('records compound counters and undoes them together', () => {
    const first = stepStat(volleyball, {}, emptyStatLog(), 'p1', 'kills', 1, 1);
    expect(first.stats['p1']).toMatchObject({ kills: 1, attempts: 1 });
    const second = stepStat(volleyball, first.stats, first.log, 'p1', 'digs', 1, 2);
    expect(lastStatEntry(second.log)).toMatchObject({ statId: 'digs', kind: 'add' });
    const undone = undoStat(second.stats, second.log);
    expect(undone.stats['p1']).toMatchObject({ kills: 1, attempts: 1, digs: 0 });
    const again = undoStat(undone.stats, undone.log);
    expect(again.stats['p1']).toMatchObject({ kills: 0, attempts: 0 });
    expect(undoStat(again.stats, again.log).changed).toBe(false);
  });

  it('does not log changes that change nothing', () => {
    const result = stepStat(volleyball, {}, emptyStatLog(), 'p1', 'kills', -1);
    expect(result.changed).toBe(false);
    expect(result.log.entries).toHaveLength(0);
    expect(stepStat(volleyball, {}, emptyStatLog(), 'p1', 'unknown', 1).changed).toBe(false);
  });

  it('undoes an exact correction', () => {
    const set = setStatValue(volleyball, { p1: { kills: 3 } }, emptyStatLog(), 'p1', 'kills', 7);
    expect(set.stats['p1']!['kills']).toBe(7);
    expect(undoStat(set.stats, set.log).stats['p1']!['kills']).toBe(3);
  });

  it('forgets removed players', () => {
    const result = stepStat(volleyball, {}, emptyStatLog(), 'gone', 'kills', 1);
    expect(pruneStatLog(result.log, new Set(['p1'])).entries).toHaveLength(0);
  });
});
