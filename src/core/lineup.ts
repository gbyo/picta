/**
 * Who is on the court.
 *
 * Volleyball plays six a side, so the on-court set is capped at six: the panel on
 * the output display is built for exactly that many rows, and silently showing a
 * seventh would push a row off the bottom of a screen nobody is standing next to.
 *
 * Pure logic, so the rule that decides "was that a substitution, or was the
 * operator still ticking in the starting six" can be tested without a court.
 */

import { STAT_KEYS, STAT_LABELS, type Player } from './stats.js';

/** Players on the court in volleyball. */
export const LINEUP_SIZE = 6;

export function onCourt(roster: readonly Player[]): Player[] {
  return roster.filter((player) => player.onCourt);
}

export function onCourtCount(roster: readonly Player[]): number {
  return roster.reduce((total, player) => total + (player.onCourt ? 1 : 0), 0);
}

export function lineupIsFull(roster: readonly Player[]): boolean {
  return onCourtCount(roster) >= LINEUP_SIZE;
}

export interface LineupResult {
  roster: Player[];
  /** False when the change was refused because the court is already full. */
  changed: boolean;
}

/**
 * Tick a player on or off the court.
 *
 * Ticking a seventh player on is refused rather than quietly dropping someone
 * else: which player comes off is the operator's call. Ticking off never fails.
 */
export function setOnCourt(roster: readonly Player[], id: string, on: boolean): LineupResult {
  const player = roster.find((p) => p.id === id);
  if (!player || player.onCourt === on) return { roster: roster.slice(), changed: false };
  if (on && lineupIsFull(roster)) return { roster: roster.slice(), changed: false };
  return {
    roster: roster.map((p) => (p.id === id ? { ...p, onCourt: on } : p)),
    changed: true,
  };
}

/**
 * Should ticking this player on put their card on the display?
 *
 * Only once a starting six has been set. Before that, ticking boxes is setup —
 * otherwise entering a lineup would fire six cards one after another.
 *
 * `established` is the caller's memory of whether the lineup has ever been full.
 * It is runtime state, never saved: a `.picta` opened with six already on court
 * starts out established.
 */
export function tickIsSubstitution(established: boolean): boolean {
  return established;
}

/** One row of the on-court panel. Pre-formatted; the display does no arithmetic. */
export interface BoardRow {
  number: string;
  name: string;
  kills: string;
  assists: string;
  digs: string;
  blocks: string;
}

/** Column headings for the panel, in the same order as the row fields. */
export const BOARD_COLUMNS = STAT_KEYS.map((key) => ({
  key,
  short: STAT_LABELS[key].short,
  long: STAT_LABELS[key].long,
}));

/**
 * The rows for the always-on panel: the players currently on the court, in
 * roster order, with the four figures worth reading at a glance.
 */
export function boardRows(roster: readonly Player[]): BoardRow[] {
  return onCourt(roster)
    .slice(0, LINEUP_SIZE)
    .map((player) => ({
      number: player.number,
      name: player.name,
      kills: String(player.stats.kills),
      assists: String(player.stats.assists),
      digs: String(player.stats.digs),
      blocks: String(player.stats.blocks),
    }));
}
