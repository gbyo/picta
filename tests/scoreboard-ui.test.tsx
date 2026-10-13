// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderScoreboard } from '../src/app/scoreboard-ui.js';
import { defaultVolleyballScore } from '../src/core/score.js';
import { screenFromTemplate } from '../src/core/screens.js';
import { ScreenRender } from '../src/controller/components/picta/screen-render.js';
import { install } from '../src/controller/boot.js';
import { createTestPlatform } from './controller/harness.js';

describe('shared audience scoreboard', () => {
  it('uses the same score markup in the output and the operator monitor', () => {
    install(createTestPlatform());
    const score = {
      ...defaultVolleyballScore(),
      homePoints: 25,
      awayPoints: 23,
      serving: 'away' as const,
    };
    const output = document.createElement('div');
    renderScoreboard(output, score);
    const { container } = render(
      <ScreenRender
        screen={screenFromTemplate('full', 'Score', 'score', [{ kind: 'score' }])}
        aspect={16 / 9}
        score={score}
        board={{ rows: [], columns: [] }}
        media={{ item: null, sizing: 'fit' }}
        background="#000"
      />,
    );
    expect(container.querySelector('.scoreboard-shell')?.innerHTML).toBe(output.innerHTML);
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
