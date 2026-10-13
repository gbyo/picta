import { describe, expect, it } from 'vitest';
import { parseRosterText } from '../src/core/roster-import.js';
import { sportDefinition } from '../src/core/sports.js';

const positions = sportDefinition('volleyball').positions;

describe('pasted rosters', () => {
  it('reads spaces, commas and tabs, matching sport positions', () => {
    const { players, skipped } = parseRosterText(
      '#7 Avery Chen OH\n12, Hannah Brooks, Outside Hitter\n2\tMaya Okafor\tS\nLena Park',
      positions,
    );
    expect(players).toEqual([
      { number: '7', name: 'Avery Chen', position: 'OH' },
      { number: '12', name: 'Hannah Brooks', position: 'OH' },
      { number: '2', name: 'Maya Okafor', position: 'S' },
      { number: '', name: 'Lena Park', position: '' },
    ]);
    expect(skipped).toEqual([]);
  });

  it('keeps leading zeros and skips header rows and blank lines', () => {
    const { players, skipped } = parseRosterText(
      'No., Name, Position\n\n00 Dana Whitfield MB\n0 Riley Nguyen',
      positions,
    );
    expect(players.map((player) => player.number)).toEqual(['00', '0']);
    expect(skipped).toEqual(['No., Name, Position']);
  });

  it('does not mistake a surname for a position', () => {
    const { players } = parseRosterText('9 Jordan Ellis', positions);
    expect(players[0]).toEqual({ number: '9', name: 'Jordan Ellis', position: '' });
  });

  it('keeps an unknown delimited position as written', () => {
    const { players } = parseRosterText('5, Sam Doe, Keeper', []);
    expect(players[0]).toEqual({ number: '5', name: 'Sam Doe', position: 'Keeper' });
  });
});
