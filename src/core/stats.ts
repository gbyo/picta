/**
 * Volleyball roster and statistics.
 *
 * Four counters per player — kills, assists, digs, blocks — which are the four
 * that go on the display. Pure logic only, so the counting rules are testable
 * without a window and the controller table and the output display cannot drift
 * apart.
 */

/** The counters kept for each player. */
export interface PlayerStats {
  kills: number;
  assists: number;
  digs: number;
  blocks: number;
}

export interface Player {
  /** Stable identifier, so reordering or renaming never moves someone's stats. */
  readonly id: string;
  /** Jersey number, kept as text: "00" and "0" are different players. */
  number: string;
  name: string;
  /** Free text, e.g. "OH", "S", "MB". May be empty. */
  position: string;
  stats: PlayerStats;
  /** On the court right now. At most `LINEUP_SIZE` players are. */
  onCourt: boolean;
}

export const STAT_KEYS = [
  'kills',
  'assists',
  'digs',
  'blocks',
] as const satisfies readonly (keyof PlayerStats)[];

export type StatKey = (typeof STAT_KEYS)[number];

/** Column heading and full name. The short forms are the box-score initials. */
export const STAT_LABELS: Record<StatKey, { short: string; long: string }> = {
  kills: { short: 'K', long: 'Kills' },
  assists: { short: 'A', long: 'Assists' },
  digs: { short: 'D', long: 'Digs' },
  blocks: { short: 'B', long: 'Blocks' },
};

/** A counter can never be negative, and nobody needs five figures of digs. */
export const MAX_STAT = 999;

export function emptyStats(): PlayerStats {
  return { kills: 0, assists: 0, digs: 0, blocks: 0 };
}

/** Ids only have to be unique within one document. */
export function makePlayer(number: string, name: string, position = ''): Player {
  return {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    number: number.trim(),
    name: name.trim(),
    position: position.trim(),
    stats: emptyStats(),
    onCourt: false,
  };
}

export function findPlayer(roster: readonly Player[], id: string): Player | null {
  return roster.find((player) => player.id === id) ?? null;
}

/**
 * Set one counter to an exact value, clamped to a sensible range.
 *
 * Out-of-range ids and unusable values are ignored rather than throwing: a stray
 * click or a half-typed number during a match must never interrupt anything.
 */
export function setStat(
  roster: readonly Player[],
  id: string,
  key: StatKey,
  value: number,
): Player[] {
  if (!Number.isFinite(value)) return roster.slice();
  const clamped = Math.max(0, Math.min(MAX_STAT, Math.floor(value)));
  return roster.map((player) => {
    if (player.id !== id) return player;
    if (player.stats[key] === clamped) return player;
    return { ...player, stats: { ...player.stats, [key]: clamped } };
  });
}

/** Nudge one counter up or down. */
export function adjustStat(
  roster: readonly Player[],
  id: string,
  key: StatKey,
  delta: number,
): Player[] {
  const player = findPlayer(roster, id);
  if (!player) return roster.slice();
  return setStat(roster, id, key, player.stats[key] + delta);
}

export function removePlayer(roster: readonly Player[], id: string): Player[] {
  return roster.filter((player) => player.id !== id);
}

/** Clear every counter and keep the roster: what starting a new match means. */
export function resetStats(roster: readonly Player[]): Player[] {
  return roster.map((player) => ({ ...player, stats: emptyStats() }));
}

export function teamTotals(roster: readonly Player[]): PlayerStats {
  const total = emptyStats();
  for (const player of roster) {
    for (const key of STAT_KEYS) total[key] += player.stats[key];
  }
  return total;
}

/** How a player is described on the takeover card and in messages. */
export function playerLabel(player: Player): string {
  return player.number === '' ? player.name : `#${player.number} ${player.name}`;
}

export interface TakeoverStat {
  label: string;
  value: string;
}

/** The four figures on the takeover card. */
export function takeoverStats(stats: PlayerStats): TakeoverStat[] {
  return STAT_KEYS.map((key) => ({
    label: STAT_LABELS[key].long,
    value: String(stats[key]),
  }));
}
