import { describe, expect, it } from 'vitest';
import {
  defaultVolleyballScreens,
  resolvePanelRects,
  screenFromTemplate,
  validateScreens,
} from '../src/core/screens.js';

describe('flat Screen model', () => {
  it.each([
    [1920, 1080, 960],
    [3840, 1080, 1920],
  ])('resolves 50/50 exactly at %d × %d', (width, height, half) => {
    const screen = screenFromTemplate('half-left-right');
    expect(resolvePanelRects(screen, width, height)).toEqual([
      { id: 'panel-left', content: { kind: 'media' }, x: 0, y: 0, width: half, height },
      { id: 'panel-right', content: { kind: 'score' }, x: half, y: 0, width: half, height },
    ]);
  });

  it('provides exact 65/35 and 35/65 normalized geometry', () => {
    expect(screenFromTemplate('65-35-left-right').panels.map((panel) => panel.rect.width)).toEqual([
      0.65, 0.35,
    ]);
    expect(screenFromTemplate('35-65-left-right').panels.map((panel) => panel.rect.width)).toEqual([
      0.35, 0.65,
    ]);
  });

  it('provides the five compact volleyball defaults', () => {
    const set = defaultVolleyballScreens();
    expect(set.defaultScreenId).toBe('media-score');
    expect(set.screens.map((screen) => screen.name)).toEqual([
      'Media + Score',
      'Media + Stats',
      'Full Media',
      'Full Score',
      'Full Stats',
    ]);
  });

  it('validates panels without a required media/program role', () => {
    const score = screenFromTemplate('full', 'Score', 'score', [{ kind: 'score' }]);
    expect(validateScreens([score], score.id).ok).toBe(true);
    const invalid = {
      ...score,
      panels: [{ ...score.panels[0]!, rect: { x: 0.8, y: 0, width: 0.4, height: 1 } }],
    };
    const checked = validateScreens([invalid], invalid.id);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.kind).toBe('invalid-geometry');
  });
});
