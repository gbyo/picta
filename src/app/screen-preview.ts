/** Faithful controller preview driven by the same flat Screen model as output. */

import type { BoardData, Screen, VolleyballScoreState } from '../core/domain.js';
import { renderScoreboard } from './scoreboard-ui.js';

export interface ScreenPreviewState {
  score: VolleyballScoreState;
  stats: BoardData;
  mediaLabel?: string;
  mediaSrc?: string;
  selectedPanelId?: string;
  onSelectPanel?(panelId: string): void;
}

export function renderScreenPreview(
  host: HTMLElement,
  screen: Screen,
  state: ScreenPreviewState,
): void {
  host.replaceChildren();
  host.classList.add('screen-preview');
  for (const panel of screen.panels) {
    const element = document.createElement('section');
    element.className = `preview-panel preview-${panel.content.kind}`;
    if (state.selectedPanelId === panel.id) element.classList.add('selected');
    if (state.onSelectPanel) {
      element.tabIndex = 0;
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', `${panel.content.kind} panel`);
      element.addEventListener('click', () => state.onSelectPanel?.(panel.id));
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          state.onSelectPanel?.(panel.id);
        }
      });
    }
    element.style.left = `${panel.rect.x * 100}%`;
    element.style.top = `${panel.rect.y * 100}%`;
    element.style.width = `${panel.rect.width * 100}%`;
    element.style.height = `${panel.rect.height * 100}%`;
    if (panel.content.kind === 'media') {
      if (state.mediaSrc) {
        const image = document.createElement('img');
        image.src = state.mediaSrc;
        image.alt = '';
        element.append(image);
      }
      const label = document.createElement('span');
      label.textContent = state.mediaLabel ?? 'No media loaded';
      element.append(label);
    } else if (panel.content.kind === 'score') {
      const shell = document.createElement('div');
      renderScoreboard(shell, state.score);
      element.append(shell);
    } else if (panel.content.kind === 'stats') {
      const table = document.createElement('div');
      table.className = 'preview-stats-table';
      for (const row of state.stats.rows.slice(0, 6)) {
        const line = document.createElement('div');
        const name = document.createElement('span');
        name.textContent = `${row.number ? `#${row.number} ` : ''}${row.name}`;
        const values = document.createElement('strong');
        values.textContent = row.values.slice(0, 4).join(' · ');
        line.append(name, values);
        table.append(line);
      }
      if (state.stats.rows.length === 0) table.textContent = 'Stats needs a team roster';
      element.append(table);
    }
    host.append(element);
  }
}
