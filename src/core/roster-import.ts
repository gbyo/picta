/**
 * Paste-a-roster parsing.
 *
 * Coaches keep rosters in spreadsheets and emails. One player per line, in
 * any of these shapes, is accepted:
 *
 *   7 Avery Chen OH
 *   #7, Avery Chen, Outside Hitter
 *   7<TAB>Avery Chen<TAB>OH
 *   Avery Chen
 *
 * Positions are matched against the sport's positions by short label or full
 * name; anything else stays part of the name. Pure, so it is easy to trust.
 */

import type { PositionDefinition } from './sports.js';

export interface ImportedPlayer {
  number: string;
  name: string;
  position: string;
}

export interface RosterImportResult {
  players: ImportedPlayer[];
  /** Lines that could not become a player (for example a header row). */
  skipped: string[];
}

const HEADER = /^(#|no\.?|number|num)\s*[,\t ]+\s*(name|player)/i;

function matchPosition(token: string, positions: readonly PositionDefinition[]): string | null {
  const value = token.trim().toLocaleLowerCase();
  if (!value) return null;
  for (const position of positions) {
    if (position.shortLabel.toLocaleLowerCase() === value) return position.shortLabel;
    if (position.label.toLocaleLowerCase() === value) return position.shortLabel;
  }
  return null;
}

export function parseRosterText(
  text: string,
  positions: readonly PositionDefinition[] = [],
): RosterImportResult {
  const players: ImportedPlayer[] = [];
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (HEADER.test(line)) {
      skipped.push(line);
      continue;
    }
    const delimited = line.includes('\t') || line.includes(',');
    let parts = delimited
      ? line
          .split(/\t|,/)
          .map((part) => part.trim())
          .filter(Boolean)
      : line.split(/\s+/);
    let number = '';
    const first = parts[0]?.replace(/^#/, '') ?? '';
    if (/^\d{1,3}$/.test(first)) {
      number = first;
      parts = parts.slice(1);
    }
    let position = '';
    if (parts.length > 1) {
      const last = parts.at(-1) ?? '';
      const matched = matchPosition(last, positions);
      if (matched) {
        position = matched;
        parts = parts.slice(0, -1);
      } else if (delimited) {
        position = last;
        parts = parts.slice(0, -1);
      } else if (
        !delimited &&
        parts.length > 2 &&
        positions.length === 0 &&
        /^[A-Z]{1,3}$/.test(last)
      ) {
        position = last;
        parts = parts.slice(0, -1);
      }
    }
    const name = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (!name || name.length > 80) {
      skipped.push(line);
      continue;
    }
    players.push({ number, name, position });
  }
  return { players, skipped };
}
