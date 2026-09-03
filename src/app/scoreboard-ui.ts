/** Identical score markup for the audience display and operator preview. */
import type { VolleyballScoreState } from '../core/domain.js';
import { matchWinner, setPointTarget } from '../core/score.js';

export function renderScoreboard(host: HTMLElement, score: VolleyballScoreState): void {
  host.replaceChildren();
  host.classList.add('scoreboard-shell');
  const status = document.createElement('div');
  status.className = 'scoreboard-set';
  status.textContent = matchWinner(score)
    ? 'FINAL'
    : `SET ${score.setNumber} · TO ${setPointTarget(score)}`;
  host.append(status);
  for (const side of ['home', 'away'] as const) {
    const team = document.createElement('section');
    team.className = `scoreboard-team ${score.serving === side ? 'serving' : ''}`;
    team.style.setProperty('--team-color', score[side].primaryColor);
    const name = document.createElement('strong');
    name.className = 'scoreboard-name';
    name.textContent = score[side].name;
    const points = document.createElement('div');
    points.className = 'scoreboard-points';
    const value = side === 'home' ? score.homePoints : score.awayPoints;
    points.textContent = String(value);
    points.style.setProperty('--point-digits', String(Math.max(2, String(value).length)));
    const footer = document.createElement('div');
    footer.className = 'scoreboard-footer';
    const sets = document.createElement('strong');
    sets.textContent = `SETS ${side === 'home' ? score.homeSets : score.awaySets}`;
    const serve = document.createElement('span');
    serve.className = 'scoreboard-serve';
    serve.textContent = score.serving === side ? '● SERVE' : '';
    footer.append(sets, serve);
    team.append(name, points, footer);
    host.append(team);
  }
}
