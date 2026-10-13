import { describe, expect, it } from 'vitest';
import { shortLabelFromLabel, statIdFromLabel } from '../src/core/custom-stats.js';

describe('custom statistic fields', () => {
  it('derives a stable lowercase id from a label', () => {
    expect(statIdFromLabel('Points')).toBe('points');
    expect(statIdFromLabel('  Blocked Shots  ')).toBe('blocked-shots');
    expect(statIdFromLabel('2-Point %')).toBe('2-point');
  });

  it('never leaves an id with leading or trailing separators', () => {
    expect(statIdFromLabel('!!!')).toBe('');
    expect(statIdFromLabel('— saves —')).toBe('saves');
  });

  it('suggests a short board column label', () => {
    expect(shortLabelFromLabel('Points')).toBe('POIN');
    expect(shortLabelFromLabel('Ace')).toBe('ACE');
    expect(shortLabelFromLabel('')).toBe('');
  });
});
