// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderScoreboard } from '../src/app/scoreboard-ui.js';
import { renderScreenPreview } from '../src/app/screen-preview.js';
import { defaultVolleyballScore } from '../src/core/score.js';
import { screenFromTemplate } from '../src/core/screens.js';

describe('shared audience scoreboard', () => {
  it('uses the same score markup in the output and operator preview', () => {
    const score = {
      ...defaultVolleyballScore(),
      homePoints: 25,
      awayPoints: 23,
      serving: 'away' as const,
    };
    const output = document.createElement('div');
    renderScoreboard(output, score);
    const preview = document.createElement('div');
    renderScreenPreview(
      preview,
      screenFromTemplate('full', 'Score', 'score', [{ kind: 'score' }]),
      { score, stats: { rows: [], columns: [] } },
    );
    expect(preview.querySelector('.scoreboard-shell')?.innerHTML).toBe(output.innerHTML);
    expect(output.querySelector('.scoreboard-set')?.textContent).toBe('SET 1 · TO 25');
    expect(output.querySelector('.serving')?.textContent).toContain('● SERVE');
  });

  it('shows FINAL for a completed match and keeps untrusted team names as text', () => {
    const score = { ...defaultVolleyballScore(), homeSets: 3 };
    score.home.name = '<img src=x onerror=alert(1)>';
    const output = document.createElement('div');
    renderScoreboard(output, score);
    expect(output.querySelector('.scoreboard-set')?.textContent).toBe('FINAL');
    expect(output.querySelector('img')).toBeNull();
    expect(output.querySelector('.scoreboard-name')?.textContent).toBe(score.home.name);
  });
});
