/**
 * The roster and stat-entry list in the controller.
 *
 * Built for use during a game on a 460px-wide window: one row per player, and
 * the counters for exactly one player expanded at a time. A wide table would not
 * fit, and nine counters for every player at once cannot be aimed at while
 * watching the court.
 *
 * Rendering is a full redraw of the list, which at roster sizes (a dozen or two
 * players) is far cheaper than the bugs that come with partial updates.
 */

import {
  STAT_KEYS,
  STAT_LABELS,
  formatHalves,
  formatHittingPercentage,
  hittingPercentage,
  playerLabel,
  points,
  statSummary,
  totalBlocks,
  type Player,
  type StatKey,
} from '../core/stats.js';

export interface RosterHandlers {
  onAdjust(id: string, key: StatKey, delta: number): void;
  onAttack(id: string, outcome: 'kill' | 'error' | 'attempt', undo: boolean): void;
  onRemove(id: string): void;
  onTakeover(id: string): void;
  onExpand(id: string | null): void;
  onEdit(id: string, field: 'number' | 'name' | 'position', value: string): void;
}

export interface RosterViewState {
  /** Which player's counters are open, if any. */
  expandedId: string | null;
  /** Takeover is only possible while a show is running. */
  canTakeover: boolean;
}

function button(label: string, className: string, title?: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  if (title) {
    element.title = title;
    element.setAttribute('aria-label', title);
  }
  return element;
}

/** A labelled +/− counter. */
function stepper(player: Player, key: StatKey, handlers: RosterHandlers): HTMLDivElement {
  const labels = STAT_LABELS[key];
  const cell = document.createElement('div');
  cell.className = 'stat-cell';

  const head = document.createElement('div');
  head.className = 'stat-head';

  const name = document.createElement('span');
  name.className = 'stat-abbr';
  name.textContent = labels.short;
  name.title = labels.long;

  const value = document.createElement('span');
  value.className = 'stat-value';
  value.textContent = String(player.stats[key]);

  head.append(name, value);

  const controls = document.createElement('div');
  controls.className = 'stat-controls';

  const minus = button('−', 'stat-step', `One fewer ${labels.long.toLowerCase()}`);
  minus.addEventListener('click', () => handlers.onAdjust(player.id, key, -1));
  const plus = button('+', 'stat-step', `One more ${labels.long.toLowerCase()}`);
  plus.addEventListener('click', () => handlers.onAdjust(player.id, key, 1));

  controls.append(minus, plus);
  cell.append(head, controls);
  return cell;
}

/**
 * The three attack buttons.
 *
 * Separate from the plain counters because an attack always adds an attempt as
 * well; making the operator remember that during a rally is how hitting
 * percentages end up wrong.
 */
function attackRow(player: Player, handlers: RosterHandlers): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'attack-row';

  const outcomes: [string, 'kill' | 'error' | 'attempt', string][] = [
    ['Kill', 'kill', 'Kill (also counts an attempt)'],
    ['Error', 'error', 'Attack error (also counts an attempt)'],
    ['Attempt', 'attempt', 'Attack that was neither a kill nor an error'],
  ];

  for (const [label, outcome, title] of outcomes) {
    const group = document.createElement('div');
    group.className = 'attack-group';
    const add = button(label, 'attack-button', title);
    add.addEventListener('click', () => handlers.onAttack(player.id, outcome, false));
    const undo = button('−', 'attack-undo', `Undo one ${label.toLowerCase()}`);
    undo.addEventListener('click', () => handlers.onAttack(player.id, outcome, true));
    group.append(add, undo);
    row.append(group);
  }

  return row;
}

function derivedLine(player: Player): HTMLParagraphElement {
  const line = document.createElement('p');
  line.className = 'derived';
  const hitting = formatHittingPercentage(hittingPercentage(player.stats));
  line.textContent = `Hitting ${hitting} · ${formatHalves(totalBlocks(player.stats))} blocks · ${formatHalves(points(player.stats))} pts`;
  return line;
}

export function renderRoster(
  list: HTMLUListElement,
  roster: readonly Player[],
  view: RosterViewState,
  handlers: RosterHandlers,
): void {
  list.replaceChildren();

  for (const player of roster) {
    const item = document.createElement('li');
    item.className = 'player';
    const expanded = view.expandedId === player.id;
    if (expanded) item.classList.add('expanded');

    // --- the always-visible row ---
    const row = document.createElement('div');
    row.className = 'player-row';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'player-toggle';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.addEventListener('click', () => handlers.onExpand(expanded ? null : player.id));

    const identity = document.createElement('span');
    identity.className = 'player-identity';

    const jersey = document.createElement('span');
    jersey.className = 'player-number';
    jersey.textContent = player.number === '' ? '–' : player.number;

    const names = document.createElement('span');
    names.className = 'player-names';
    const nameLine = document.createElement('span');
    nameLine.className = 'player-name';
    nameLine.textContent = player.name;
    const summary = document.createElement('span');
    summary.className = 'player-summary';
    summary.textContent = statSummary(player.stats);
    names.append(nameLine, summary);

    identity.append(jersey, names);

    if (player.position !== '') {
      const position = document.createElement('span');
      position.className = 'player-position';
      position.textContent = player.position;
      identity.append(position);
    }

    toggle.append(identity);

    const show = button('Show', 'show-button', `Show ${playerLabel(player)} on the display`);
    show.disabled = !view.canTakeover;
    if (!view.canTakeover) {
      show.title = 'Start the show first, then Show puts this player on the display.';
    }
    show.addEventListener('click', () => handlers.onTakeover(player.id));

    row.append(toggle, show);
    item.append(row);

    // --- the counters, only for the open player ---
    if (expanded) {
      const panel = document.createElement('div');
      panel.className = 'player-panel';

      const fields = document.createElement('div');
      fields.className = 'player-fields';
      const editable: [string, 'number' | 'name' | 'position', string][] = [
        ['#', 'number', player.number],
        ['Name', 'name', player.name],
        ['Pos', 'position', player.position],
      ];
      for (const [label, field, value] of editable) {
        const wrap = document.createElement('label');
        wrap.className = `field field-${field}`;
        const text = document.createElement('span');
        text.textContent = label;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.autocomplete = 'off';
        input.addEventListener('change', () => handlers.onEdit(player.id, field, input.value));
        wrap.append(text, input);
        fields.append(wrap);
      }
      panel.append(fields);

      panel.append(attackRow(player, handlers));

      const grid = document.createElement('div');
      grid.className = 'stat-grid';
      // The three attack counters are driven by the buttons above, so only the
      // remaining ones get plain steppers.
      for (const key of STAT_KEYS) {
        if (key === 'kills' || key === 'attackErrors' || key === 'attempts') continue;
        grid.append(stepper(player, key, handlers));
      }
      panel.append(grid);

      panel.append(derivedLine(player));

      const remove = button('Remove Player', 'small-button', `Remove ${playerLabel(player)}`);
      remove.addEventListener('click', () => handlers.onRemove(player.id));
      panel.append(remove);

      item.append(panel);
    }

    list.append(item);
  }
}
