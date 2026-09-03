/** DOM rendering for the match controls kept on the Live console. */

import type { ScoreAction, ScoreHistory } from '../core/score.js';
import { matchWinner, setPointTarget } from '../core/score.js';

export interface ScoreDeckElements {
  summary: HTMLElement;
  controls: HTMLElement;
}

export interface ScoreDeckHandlers {
  onAction(action: ScoreAction): void;
  onEndSet(): void;
  onUndo(): void;
  onReset(): void;
}

function button(
  label: string,
  accessibleName: string,
  onClick: () => void,
  className = '',
): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  element.setAttribute('aria-label', accessibleName);
  element.addEventListener('click', onClick);
  return element;
}

export function renderScoreDeck(
  elements: ScoreDeckElements,
  history: ScoreHistory,
  handlers: ScoreDeckHandlers,
): void {
  const score = history.present;
  elements.summary.textContent = `${score.home.name} ${score.homePoints} · ${score.awayPoints} ${score.away.name} · ${matchWinner(score) ? 'FINAL' : `Set ${score.setNumber} · to ${setPointTarget(score)}, win by 2`}`;
  elements.controls.replaceChildren();

  const teams = document.createElement('div');
  teams.className = 'score-team-controls';
  for (const side of ['home', 'away'] as const) {
    const card = document.createElement('section');
    card.className = `score-team-card ${score.serving === side ? 'serving' : ''}`;
    card.style.setProperty('--team-color', score[side].primaryColor);
    const name = document.createElement('input');
    name.className = 'score-team-name';
    name.value = score[side].name;
    name.maxLength = 40;
    name.setAttribute('aria-label', `${side === 'home' ? 'Home' : 'Away'} team name`);
    name.addEventListener('change', () =>
      handlers.onAction({ type: 'team-name', side, value: name.value }),
    );
    const points = document.createElement('strong');
    points.className = 'score-value';
    points.textContent = String(side === 'home' ? score.homePoints : score.awayPoints);
    const pointActions = document.createElement('div');
    pointActions.className = 'score-point-actions';
    pointActions.append(
      button('−', `Subtract one ${side} point`, () =>
        handlers.onAction({ type: 'point', side, delta: -1 }),
      ),
      button(
        '+1',
        `Add one ${side} point`,
        () => handlers.onAction({ type: 'point', side, delta: 1 }),
        'score-add',
      ),
    );
    const sets = document.createElement('div');
    sets.className = 'sets-control';
    const currentSets = side === 'home' ? score.homeSets : score.awaySets;
    const label = document.createElement('span');
    label.textContent = `Sets ${currentSets}`;
    sets.append(
      label,
      button('−', `Subtract ${side} set`, () =>
        handlers.onAction({ type: 'sets-won', side, value: currentSets - 1 }),
      ),
      button('+', `Add ${side} set`, () =>
        handlers.onAction({ type: 'sets-won', side, value: currentSets + 1 }),
      ),
    );
    const serve = button(
      score.serving === side ? '● Serving' : 'Set serve',
      `Set ${side} serving`,
      () => handlers.onAction({ type: 'serve', side }),
      'serve-button',
    );
    card.append(name, points, pointActions, sets, serve);
    teams.append(card);
  }

  const match = document.createElement('div');
  match.className = 'match-actions';
  const formatLabel = document.createElement('label');
  formatLabel.className = 'match-format-control';
  formatLabel.append('Match ');
  const format = document.createElement('select');
  format.setAttribute('aria-label', 'Match format');
  for (const value of ['best-of-3', 'best-of-5'] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === 'best-of-3' ? 'Best of 3' : 'Best of 5';
    format.append(option);
  }
  format.value = score.matchFormat;
  format.addEventListener('change', () =>
    handlers.onAction({
      type: 'match-format',
      value: format.value === 'best-of-3' ? 'best-of-3' : 'best-of-5',
    }),
  );
  formatLabel.append(format);
  match.append(
    formatLabel,
    button('Set −', 'Previous set number', () =>
      handlers.onAction({ type: 'set-number', value: score.setNumber - 1 }),
    ),
    button(
      `Set ${score.setNumber}`,
      `Current set ${score.setNumber}`,
      () => undefined,
      'set-indicator',
    ),
    button('Set +', 'Next set number', () =>
      handlers.onAction({ type: 'set-number', value: score.setNumber + 1 }),
    ),
    button('End Set', 'End the current set', handlers.onEndSet, 'end-set-button'),
    button('Undo', 'Undo last score action', handlers.onUndo),
    button('Swap sides', 'Swap home and away sides', () =>
      handlers.onAction({ type: 'swap-sides' }),
    ),
    button('Reset match score', 'Reset match score', handlers.onReset, 'danger-link'),
  );
  (match.children[2] as HTMLButtonElement).disabled = true;
  (match.children[5] as HTMLButtonElement).disabled = history.past.length === 0;
  elements.controls.append(teams, match);
}
