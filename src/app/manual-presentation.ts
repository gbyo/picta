/**
 * The manual lineup workspace.
 *
 * While the operator is introducing players the Players tab becomes this and
 * nothing else: setup controls collapse, and every row is a big, scannable
 * target that reads number → name → position.  A shown player stays clickable
 * so a repeated announcement is one click away from a replay.
 */

import type { Player, PlayerGroup } from '../core/domain.js';
import {
  manualPlayerShown,
  manualShownCount,
  type ManualGroupSession,
} from '../core/manual-group.js';

export interface ManualWorkspaceElements {
  section: HTMLElement;
  title: HTMLElement;
  count: HTMLElement;
  rows: HTMLElement;
  undo: HTMLButtonElement;
  end: HTMLButtonElement;
}

export interface ManualWorkspaceView {
  session: ManualGroupSession;
  group: PlayerGroup;
  players: readonly Player[];
  outputActive: boolean;
  onPresent(playerId: string): void;
  onUndo(): void;
  onEnd(): void;
}

function playerRow(player: Player, view: ManualWorkspaceView): HTMLButtonElement {
  const { session } = view;
  const shown = manualPlayerShown(session, player.id);
  const playing = session.currentPlayerId === player.id;
  const busy = session.currentPlayerId !== null;

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'manual-row';
  if (shown) row.classList.add('shown');
  if (playing) row.classList.add('playing');
  // Shown players stay live: clicking one replays it.
  row.disabled = !view.outputActive || busy;
  row.setAttribute('aria-pressed', String(shown));

  const check = document.createElement('span');
  check.className = shown ? 'manual-check shown' : 'manual-check';
  check.textContent = shown ? '✓' : '';
  check.setAttribute('aria-hidden', 'true');

  const number = document.createElement('span');
  number.className = 'manual-number';
  number.textContent = player.number ? `#${player.number}` : '';

  const name = document.createElement('span');
  name.className = 'manual-name';
  name.textContent = player.name;

  const position = document.createElement('span');
  position.className = 'manual-position';
  position.textContent = player.position ?? '';

  const state = document.createElement('span');
  state.className = 'manual-state';
  // Only say something when there is state worth saying; an untouched row's
  // affordance already reads as "click to present".
  state.textContent = playing ? (session.currentIsReplay ? 'Replaying…' : 'Playing…') : '';

  row.append(check, number, name, position, state);
  row.setAttribute(
    'aria-label',
    `${player.number ? `Number ${player.number}, ` : ''}${player.name}${
      player.position ? `, ${player.position}` : ''
    }${shown ? ' — shown, click to replay' : ''}`,
  );
  row.addEventListener('click', () => view.onPresent(player.id));
  return row;
}

export function renderManualWorkspace(
  elements: ManualWorkspaceElements,
  view: ManualWorkspaceView | null,
): void {
  elements.section.hidden = view === null;
  elements.rows.replaceChildren();
  if (!view) return;

  const { session, group } = view;
  elements.title.textContent = group.name.toLocaleUpperCase();
  // The global live strip already carries output state; this is task context.
  elements.count.textContent = `${manualShownCount(session)} of ${session.playerIds.length} shown`;

  const byId = new Map(view.players.map((player) => [player.id, player]));
  for (const playerId of session.playerIds) {
    const player = byId.get(playerId);
    if (player) elements.rows.append(playerRow(player, view));
  }

  const busy = session.currentPlayerId !== null;
  elements.undo.disabled = busy || manualShownCount(session) === 0;
  elements.end.disabled = false;
  elements.undo.onclick = () => view.onUndo();
  elements.end.onclick = () => view.onEnd();
}
