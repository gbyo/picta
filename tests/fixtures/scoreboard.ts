/** Browser-safe sizing fixture. Uses production markup/CSS; never opens a display. */
import '../../src/present.css';
import { renderScoreboard } from '../../src/app/scoreboard-ui.js';
import { defaultVolleyballScore } from '../../src/core/score.js';
import { screenFromTemplate } from '../../src/core/screens.js';

const query = new URLSearchParams(location.search);
const full = query.get('layout') !== 'half';
const screen = screenFromTemplate(
  full ? 'full' : 'half-left-right',
  'Sizing test',
  'test',
  full ? [{ kind: 'score' }] : [{ kind: 'blank' }, { kind: 'score' }],
);
const score = {
  ...defaultVolleyballScore(),
  homePoints: 25,
  awayPoints: 23,
  homeSets: 2,
  awaySets: 1,
  setNumber: 4,
  serving: 'home' as const,
};
score.home.name = 'NINETY SIX';
score.away.name = 'OPPONENT';
for (const panel of screen.panels) {
  const root = document.createElement('section');
  root.className = 'panel';
  Object.assign(root.style, {
    position: 'absolute',
    left: `${panel.rect.x * 100}%`,
    top: `${panel.rect.y * 100}%`,
    width: `${panel.rect.width * 100}%`,
    height: `${panel.rect.height * 100}%`,
  });
  if (panel.content.kind === 'score') {
    const shell = document.createElement('div');
    renderScoreboard(shell, score);
    root.append(shell);
  }
  document.getElementById('output')!.append(root);
}
