/**
 * The controller resolves its elements once, at module load, and throws on the
 * first id that is missing.  A stale lookup therefore does not degrade one
 * control — it stops the whole app before a single handler is wired.  These
 * tests read both files as text so a rename on either side fails here.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shortLabelFromLabel, statIdFromLabel } from '../src/app/dialogs.js';

const root = resolve(import.meta.dirname, '..');

function read(file: string): string {
  return readFileSync(resolve(root, file), 'utf8');
}

function markupIds(): Set<string> {
  return new Set([...read('index.html').matchAll(/id="([^"]+)"/g)].map((match) => match[1]!));
}

function requestedIds(): string[] {
  const source = read('src/main.ts');
  return [
    ...[...source.matchAll(/need<[^>]*>\('([^']+)'\)/g)].map((match) => match[1]!),
    ...[...source.matchAll(/getElementById\('([^']+)'\)/g)].map((match) => match[1]!),
  ];
}

describe('controller element lookups', () => {
  it('finds every element the controller asks for in the rendered markup', () => {
    const available = markupIds();
    const missing = [...new Set(requestedIds())].filter((id) => !available.has(id));
    expect(missing).toEqual([]);
  });

  it('keeps every id in the markup unique, so a lookup cannot be ambiguous', () => {
    const ids = [...read('index.html').matchAll(/id="([^"]+)"/g)].map((match) => match[1]!);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });

  it('asks the operator through a dialog rather than an unsupported script prompt', () => {
    const controller = read('src/main.ts');
    expect(controller).not.toMatch(/window\.prompt\(/);
    expect(controller).not.toMatch(/window\.confirm\(/);
  });

  it('offers every built-in layout from the layout module, not from the markup', () => {
    // Hardcoded preset cards went stale against LAYOUT_PRESETS and did nothing.
    expect(read('index.html')).not.toMatch(/data-layout=/);
  });
});

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
