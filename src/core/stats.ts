/**
 * Volleyball roster and statistics.
 *
 * Pure logic only: the counting rules and the derived figures live here so they
 * can be tested without a window, and so the two places that need them — the
 * controller table and the takeover card on the output display — cannot drift
 * apart.
 *
 * The stat set follows the ordinary volleyball box score. Only raw counts are
 * stored; everything else (hitting percentage, total blocks, points) is derived,
 * because storing a computed figure is how a box score ends up contradicting
 * itself.
 */

/** The raw counters kept for each player. */
export interface PlayerStats {
  /** Attacks that ended the rally in this team's favour. */
  kills: number;
  /** Attacks that ended the rally against this team. */
  attackErrors: number;
  /** Every attack attempted, including kills and errors. */
  attempts: number;
  assists: number;
  aces: number;
  serviceErrors: number;
  digs: number;
  /** Blocks won alone. */
  blockSolos: number;
  /** Blocks shared with a teammate. */
  blockAssists: number;
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
}

export const STAT_KEYS = [
  'kills',
  'attackErrors',
  'attempts',
  'assists',
  'aces',
  'serviceErrors',
  'digs',
  'blockSolos',
  'blockAssists',
] as const satisfies readonly (keyof PlayerStats)[];

export type StatKey = (typeof STAT_KEYS)[number];

/** Short and long labels. Short ones are the conventional box-score initials. */
export const STAT_LABELS: Record<StatKey, { short: string; long: string }> = {
  kills: { short: 'K', long: 'Kills' },
  attackErrors: { short: 'E', long: 'Attack errors' },
  attempts: { short: 'TA', long: 'Total attempts' },
  assists: { short: 'A', long: 'Assists' },
  aces: { short: 'SA', long: 'Service aces' },
  serviceErrors: { short: 'SE', long: 'Service errors' },
  digs: { short: 'D', long: 'Digs' },
  blockSolos: { short: 'BS', long: 'Block solos' },
  blockAssists: { short: 'BA', long: 'Block assists' },
};

/** A counter can never be negative, and nobody needs six figures of digs. */
export const MAX_STAT = 9_999;

export function emptyStats(): PlayerStats {
  return {
    kills: 0,
    attackErrors: 0,
    attempts: 0,
    assists: 0,
    aces: 0,
    serviceErrors: 0,
    digs: 0,
    blockSolos: 0,
    blockAssists: 0,
  };
}

/** Ids only have to be unique within one document. */
export function makePlayer(number: string, name: string, position = ''): Player {
  return {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    number: number.trim(),
    name: name.trim(),
    position: position.trim(),
    stats: emptyStats(),
  };
}

// --- derived figures --------------------------------------------------------

/**
 * Total blocks, counting a shared block as half.
 *
 * Volleyball scoring convention: a solo block is one block, an assisted block
 * is half a block to each of the two players.
 */
export function totalBlocks(stats: PlayerStats): number {
  return stats.blockSolos + stats.blockAssists / 2;
}

/**
 * Hitting percentage: (kills − attack errors) ÷ total attempts.
 *
 * Returns null when there are no attempts. A player who has not attacked has no
 * hitting percentage — showing `.000` would claim they had attacked and failed.
 * The figure is legitimately negative when errors outnumber kills.
 */
export function hittingPercentage(stats: PlayerStats): number | null {
  if (stats.attempts <= 0) return null;
  return (stats.kills - stats.attackErrors) / stats.attempts;
}

/**
 * Points: kills + aces + solo blocks + half of each assisted block.
 *
 * Errors are not subtracted; a box score counts points scored.
 */
export function points(stats: PlayerStats): number {
  return stats.kills + stats.aces + stats.blockSolos + stats.blockAssists / 2;
}

/**
 * Format a hitting percentage the way a box score does: three decimal places,
 * no leading zero, and a leading minus when negative (`.312`, `-.045`, `1.000`).
 */
export function formatHittingPercentage(value: number | null): string {
  if (value === null) return '—';
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const text = magnitude.toFixed(3);
  // Values of 1.000 and above keep their leading digit; anything below drops it.
  const trimmed = magnitude < 1 ? text.replace(/^0/, '') : text;
  return `${negative ? '-' : ''}${trimmed}`;
}

/** Halves are shown as `.5`, whole numbers without a decimal point. */
export function formatHalves(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// --- roster operations ------------------------------------------------------

export function findPlayer(roster: readonly Player[], id: string): Player | null {
  return roster.find((player) => player.id === id) ?? null;
}

/**
 * Adjust one counter, clamped to a sensible range.
 *
 * Returns a new roster; the caller decides whether that counts as a document
 * change. Out-of-range ids are ignored rather than throwing, because a stray
 * click during a game must never interrupt anything.
 */
export function adjustStat(
  roster: readonly Player[],
  id: string,
  key: StatKey,
  delta: number,
): Player[] {
  return roster.map((player) => {
    if (player.id !== id) return player;
    const current = player.stats[key];
    const next = Math.max(0, Math.min(MAX_STAT, current + delta));
    if (next === current) return player;
    return { ...player, stats: { ...player.stats, [key]: next } };
  });
}

/**
 * A kill, an attack error and a plain attempt all count as an attempt, so
 * recording a kill records the attempt too. Without this the operator has to
 * remember to press two buttons during a rally, and hitting percentages come
 * out wrong.
 */
export function recordAttack(
  roster: readonly Player[],
  id: string,
  outcome: 'kill' | 'error' | 'attempt',
): Player[] {
  const key: StatKey | null =
    outcome === 'kill' ? 'kills' : outcome === 'error' ? 'attackErrors' : null;
  const withAttempt = adjustStat(roster, id, 'attempts', 1);
  return key === null ? withAttempt : adjustStat(withAttempt, id, key, 1);
}

/** Undo an attack. Never takes a counter below zero, even if they disagree. */
export function undoAttack(
  roster: readonly Player[],
  id: string,
  outcome: 'kill' | 'error' | 'attempt',
): Player[] {
  const key: StatKey | null =
    outcome === 'kill' ? 'kills' : outcome === 'error' ? 'attackErrors' : null;
  const withoutAttempt = adjustStat(roster, id, 'attempts', -1);
  return key === null ? withoutAttempt : adjustStat(withoutAttempt, id, key, -1);
}

export function removePlayer(roster: readonly Player[], id: string): Player[] {
  return roster.filter((player) => player.id !== id);
}

export function resetStats(roster: readonly Player[]): Player[] {
  return roster.map((player) => ({ ...player, stats: emptyStats() }));
}

/** Team totals, for the roster footer. */
export function teamTotals(roster: readonly Player[]): PlayerStats {
  const total = emptyStats();
  for (const player of roster) {
    for (const key of STAT_KEYS) total[key] += player.stats[key];
  }
  return total;
}

/** How a player is described on the takeover card and in the roster list. */
export function playerLabel(player: Player): string {
  return player.number === '' ? player.name : `#${player.number} ${player.name}`;
}

/**
 * The handful of figures worth putting on a screen someone reads from across a
 * room. Deliberately not all nine counters: a card with nine numbers on it
 * cannot be read in the few seconds it is up.
 */
export interface TakeoverStat {
  label: string;
  value: string;
}

export function takeoverStats(stats: PlayerStats): TakeoverStat[] {
  const out: TakeoverStat[] = [
    { label: 'Kills', value: String(stats.kills) },
    { label: 'Assists', value: String(stats.assists) },
    { label: 'Digs', value: String(stats.digs) },
    { label: 'Aces', value: String(stats.aces) },
  ];
  const blocks = totalBlocks(stats);
  if (blocks > 0) out.push({ label: 'Blocks', value: formatHalves(blocks) });
  const hitting = hittingPercentage(stats);
  if (hitting !== null) out.push({ label: 'Hitting', value: formatHittingPercentage(hitting) });
  return out;
}

/** One-line summary under a player's name in the controller list. */
export function statSummary(stats: PlayerStats): string {
  const parts = [`${stats.kills} K`, `${stats.assists} A`, `${stats.digs} D`, `${stats.aces} SA`];
  const hitting = hittingPercentage(stats);
  if (hitting !== null) parts.push(formatHittingPercentage(hitting));
  return parts.join(' · ');
}
