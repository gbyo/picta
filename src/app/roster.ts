/**
 * The player table in the controller.
 *
 * One row per player: a tick box for on-court, jersey number, name, the four
 * counters, and a button to put them on the display. Flat on purpose — during a
 * match the operator is watching a court, not hunting through disclosure panels.
 *
 * The counters are number inputs rather than pairs of buttons: they take a typed
 * correction, they step with the arrow keys, and four of them fit a row at the
 * width this window actually is.
 */

import { LINEUP_SIZE, lineupIsFull } from '../core/lineup.js';
import { STAT_KEYS, STAT_LABELS, playerLabel, type Player, type StatKey } from '../core/stats.js';

export interface RosterHandlers {
  onSetStat(id: string, key: StatKey, value: number): void;
  onSetOnCourt(id: string, on: boolean): void;
  onRemove(id: string): void;
  onTakeover(id: string): void;
  onEdit(id: string, field: 'number' | 'name' | 'position', value: string): void;
}

export interface RosterViewState {
  /** Takeover is only possible while a show is running. */
  canTakeover: boolean;
}

export function renderRoster(
  table: HTMLTableElement,
  roster: readonly Player[],
  view: RosterViewState,
  handlers: RosterHandlers,
): void {
  table.replaceChildren();
  if (roster.length === 0) return;

  const full = lineupIsFull(roster);

  // --- headings ---
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  const headings: [string, string, string][] = [
    ['col-court', 'On', 'On court'],
    ['col-number', '#', 'Jersey number'],
    ['col-name', 'Player', 'Player name'],
    ...STAT_KEYS.map(
      (key) =>
        ['col-stat', STAT_LABELS[key].short, STAT_LABELS[key].long] as [string, string, string],
    ),
    ['col-actions', '', ''],
  ];
  for (const [className, label, title] of headings) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.className = className;
    cell.textContent = label;
    if (title !== '') cell.title = title;
    headRow.append(cell);
  }
  head.append(headRow);
  table.append(head);

  // --- rows ---
  const body = document.createElement('tbody');
  for (const player of roster) {
    const row = document.createElement('tr');
    if (player.onCourt) row.classList.add('on-court');

    // On court.
    const courtCell = document.createElement('td');
    courtCell.className = 'col-court';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = player.onCourt;
    // A seventh player cannot go on; ticking someone off first is the sub.
    check.disabled = !player.onCourt && full;
    check.title = check.disabled
      ? `${LINEUP_SIZE} players are already on court — tick one off first`
      : player.onCourt
        ? `Take ${playerLabel(player)} off the court`
        : `Put ${playerLabel(player)} on the court`;
    check.setAttribute('aria-label', `${playerLabel(player)} on court`);
    check.addEventListener('change', () => handlers.onSetOnCourt(player.id, check.checked));
    courtCell.append(check);
    row.append(courtCell);

    // Jersey number and name, both editable in place.
    for (const [field, className, value, maxLength] of [
      ['number', 'col-number', player.number, 3],
      ['name', 'col-name', player.name, 40],
    ] as const) {
      const cell = document.createElement('td');
      cell.className = className;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.maxLength = maxLength;
      input.autocomplete = 'off';
      input.setAttribute('aria-label', `${playerLabel(player)} ${field}`);
      input.addEventListener('change', () => handlers.onEdit(player.id, field, input.value));
      cell.append(input);
      row.append(cell);
    }

    // The four counters.
    for (const key of STAT_KEYS) {
      const cell = document.createElement('td');
      cell.className = 'col-stat';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.value = String(player.stats[key]);
      input.setAttribute('aria-label', `${playerLabel(player)} ${STAT_LABELS[key].long}`);
      input.addEventListener('change', () =>
        handlers.onSetStat(player.id, key, Number(input.value)),
      );
      cell.append(input);
      row.append(cell);
    }

    // Show and remove.
    const actions = document.createElement('td');
    actions.className = 'col-actions';

    const show = document.createElement('button');
    show.type = 'button';
    show.className = 'show-button';
    show.textContent = 'Show';
    show.disabled = !view.canTakeover;
    show.title = view.canTakeover
      ? `Show ${playerLabel(player)} on the display`
      : 'Start the show first, then Show puts this player on the display.';
    show.setAttribute('aria-label', `Show ${playerLabel(player)} on the display`);
    show.addEventListener('click', () => handlers.onTakeover(player.id));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-button';
    remove.textContent = '×';
    remove.title = `Remove ${playerLabel(player)}`;
    remove.setAttribute('aria-label', `Remove ${playerLabel(player)}`);
    remove.addEventListener('click', () => handlers.onRemove(player.id));

    actions.append(show, remove);
    row.append(actions);

    body.append(row);
  }
  table.append(body);
}
