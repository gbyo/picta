/**
 * Live statistic entry with an operator-facing undo history.
 *
 * Every tap records exactly what it changed (including sport-defined compound
 * counters such as a kill also counting an attempt), so Undo restores the
 * previous raw values rather than guessing an inverse.
 */

import type { RawPlayerStats } from './domain.js';
import { emptyRawStats, recordStat, setRawStat, type SportDefinition } from './sports.js';

export interface StatEntry {
  playerId: string;
  statId: string;
  /** +1, -1 or an exact edit. */
  kind: 'add' | 'subtract' | 'set';
  /** Raw counters for this player before the change. */
  before: RawPlayerStats;
  at: number;
}

export type StatsByPlayer = Record<string, RawPlayerStats>;

export interface StatLog {
  entries: StatEntry[];
}

export const STAT_LOG_LIMIT = 100;

export function emptyStatLog(): StatLog {
  return { entries: [] };
}

function current(
  definition: SportDefinition,
  stats: StatsByPlayer,
  playerId: string,
): RawPlayerStats {
  return stats[playerId] ?? emptyRawStats(definition);
}

function equalStats(a: RawPlayerStats, b: RawPlayerStats): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if ((a[key] ?? 0) !== (b[key] ?? 0)) return false;
  return true;
}

export interface StatChange {
  stats: StatsByPlayer;
  log: StatLog;
  changed: boolean;
}

/** Add or subtract one counter, including the sport's compound counters. */
export function stepStat(
  definition: SportDefinition,
  stats: StatsByPlayer,
  log: StatLog,
  playerId: string,
  statId: string,
  delta: 1 | -1,
  at = Date.now(),
): StatChange {
  const before = current(definition, stats, playerId);
  const after = recordStat(definition, before, statId, delta);
  if (equalStats(before, after)) return { stats, log, changed: false };
  return {
    stats: { ...stats, [playerId]: after },
    log: {
      entries: [
        ...log.entries.slice(-(STAT_LOG_LIMIT - 1)),
        { playerId, statId, kind: delta > 0 ? 'add' : 'subtract', before, at },
      ],
    },
    changed: true,
  };
}

/** Set one counter to an exact value (a correction). */
export function setStatValue(
  definition: SportDefinition,
  stats: StatsByPlayer,
  log: StatLog,
  playerId: string,
  statId: string,
  value: number,
  at = Date.now(),
): StatChange {
  const before = current(definition, stats, playerId);
  const after = setRawStat(definition, before, statId, value);
  if (equalStats(before, after)) return { stats, log, changed: false };
  return {
    stats: { ...stats, [playerId]: after },
    log: {
      entries: [
        ...log.entries.slice(-(STAT_LOG_LIMIT - 1)),
        { playerId, statId, kind: 'set', before, at },
      ],
    },
    changed: true,
  };
}

/** Reverse the most recent entry. Entries for players no longer present are dropped. */
export function undoStat(stats: StatsByPlayer, log: StatLog): StatChange {
  const entry = log.entries.at(-1);
  if (!entry) return { stats, log, changed: false };
  return {
    stats: { ...stats, [entry.playerId]: { ...entry.before } },
    log: { entries: log.entries.slice(0, -1) },
    changed: true,
  };
}

export function lastStatEntry(log: StatLog): StatEntry | null {
  return log.entries.at(-1) ?? null;
}

/** Remove history for players that were removed from the team. */
export function pruneStatLog(log: StatLog, playerIds: ReadonlySet<string>): StatLog {
  const entries = log.entries.filter((entry) => playerIds.has(entry.playerId));
  return entries.length === log.entries.length ? log : { entries };
}
