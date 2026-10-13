/**
 * A self-contained browser preview of the controller (`npm run dev` in a plain
 * browser). It simulates two displays, an output and a sample volleyball show
 * so the operator UI can be explored and reviewed without the desktop shell.
 * Nothing here is used by the Tauri app.
 */

import type { MediaItem, ShowDocument, Team } from '@core/domain.js';
import { defaultShowDocument } from '@core/show-file.js';
import { defaultVolleyballScore } from '@core/score.js';
import { emptyPrefs, type Prefs } from '@app/prefs.js';
import { FakeOutput } from './fake-output';
import type { Platform } from './types';
import { setState } from '../state/store';
import { documentFor } from '../state/store';
import { createScoreHistory } from '@core/score.js';

const PALETTE = [
  '#1d4ed8',
  '#047857',
  '#b45309',
  '#7c3aed',
  '#be123c',
  '#0f766e',
  '#4338ca',
  '#a16207',
];

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

/** Stand-in artwork so thumbnails and the program monitor look like a real show. */
function artwork(path: string): string {
  const name = path.split('/').pop() ?? path;
  const color = PALETTE[hash(name) % PALETTE.length]!;
  const label = name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#0b0d10"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><text x="120" y="610" font-family="Helvetica, Arial" font-size="140" font-weight="800" fill="white" opacity="0.92">${label.toUpperCase()}</text><text x="124" y="700" font-family="Helvetica, Arial" font-size="44" fill="white" opacity="0.6">Picta demo media</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const MEDIA = [
  'Sponsors/acme-hardware.png',
  'Sponsors/riverside-dental.jpg',
  'Sponsors/the-corner-diner.png',
  'Promo/season-tickets.png',
  'Promo/senior-night.webp',
  'Promo/hype-reel.mp4',
  'Sponsors/blue-ridge-bank.png',
  'Promo/booster-club.png',
];

const ROSTER: [string, string, string][] = [
  ['2', 'Maya Okafor', 'S'],
  ['4', 'Lena Park', 'L'],
  ['7', 'Avery Chen', 'OH'],
  ['9', 'Jordan Ellis', 'MB'],
  ['11', 'Sofia Ramirez', 'OPP'],
  ['12', 'Hannah Brooks', 'OH'],
  ['14', 'Dana Whitfield', 'MB'],
  ['15', 'Riley Nguyen', 'DS'],
  ['18', 'Camille Laurent', 'OH'],
  ['21', 'Tess Morgan', 'DS'],
];

function demoShow(): ShowDocument {
  const base = defaultShowDocument();
  const items: MediaItem[] = MEDIA.map((path, index) => ({
    id: `media-${index + 1}`,
    type: path.endsWith('.mp4') ? 'video' : 'image',
    path: `/Demo/${path}`,
    ...(index === 3 ? { durationSeconds: 15 } : {}),
  }));
  const players = ROSTER.map(([number, name, position], index) => ({
    id: `player-${index + 1}`,
    number,
    name,
    position,
    media: index === 2 ? { introVideo: { path: '/Demo/Players/avery.mp4' } } : {},
  }));
  const team: Team = {
    version: 1,
    id: 'team-demo',
    name: 'Wildcats',
    sport: 'volleyball',
    colors: { primary: '#0f6b46', secondary: '#ffffff' },
    players,
    groups: [
      {
        id: 'starting-lineup',
        name: 'Starting Lineup',
        playerIds: players.slice(0, 6).map((p) => p.id),
        maxPlayers: 6,
      },
      {
        id: 'on-court',
        name: 'On Court',
        playerIds: players.slice(0, 6).map((p) => p.id),
        maxPlayers: 6,
      },
      {
        id: 'seniors',
        name: 'Senior Night',
        playerIds: [players[2]!.id, players[6]!.id, players[9]!.id],
      },
    ],
  };
  const score = {
    ...defaultVolleyballScore(team),
    away: { name: 'Eagles', primaryColor: '#9a1b2f' },
    homePoints: 14,
    awayPoints: 11,
    homeSets: 1,
    serving: 'home' as const,
    setNumber: 2,
  };
  return {
    ...base,
    media: {
      kind: 'inline',
      data: {
        version: 1,
        name: 'Fall Sponsors',
        items,
        transition: 'crossfade',
        imageSizing: 'fit',
        imageDurationSeconds: 8,
      },
    },
    team: { kind: 'inline', data: team },
    event: {
      stats: {
        'player-3': { kills: 6, attackErrors: 2, attempts: 15, aces: 1, digs: 4 },
        'player-6': { kills: 4, attempts: 9, digs: 2 },
        'player-1': { assists: 14, digs: 3 },
        'player-4': { blockSolos: 2, blockAssists: 1, kills: 3, attempts: 5 },
      },
      liveGroups: {},
      score,
    },
  };
}

export function createDemoPlatform(): Platform {
  let prefs: Prefs = { ...emptyPrefs };
  const data = demoShow();
  const doc = documentFor(data);
  setState({
    doc,
    armedScreenId: data.defaultScreenId,
    scoreHistory: createScoreHistory(data.event.score!),
  });
  let extra = 0;
  const unavailable = async () => {
    throw new Error('Not available in the browser preview.');
  };
  return {
    native: false,
    pathStyle: async () => 'posix',
    assetUrl: (path) => artwork(path),
    createOutput: (handlers) =>
      new FakeOutput(handlers, { stageDelayMs: 280, autoAdvance: true, videoMs: 6000 }),
    displays: {
      list: async () => [
        {
          id: 'builtin',
          index: 1,
          name: 'Built-in Retina Display',
          width: 3024,
          height: 1964,
          x: 0,
          y: 0,
          scaleFactor: 2,
          isPrimary: true,
        },
        {
          id: 'tv',
          index: 2,
          name: 'Samsung Scoreboard TV',
          width: 1920,
          height: 1080,
          x: 3024,
          y: 0,
          scaleFactor: 1,
          isPrimary: false,
        },
      ],
      identify: async () => undefined,
    },
    presentation: {
      prepare: async (id) => ({
        id,
        index: 2,
        name: 'Samsung Scoreboard TV',
        width: 1920,
        height: 1080,
        x: 3024,
        y: 0,
        scaleFactor: 1,
        isPrimary: false,
      }),
      show: async (id) => ({
        id,
        index: 2,
        name: 'Samsung Scoreboard TV',
        width: 1920,
        height: 1080,
        x: 3024,
        y: 0,
        scaleFactor: 1,
        isPrimary: false,
      }),
      close: async () => undefined,
    },
    files: {
      allowMedia: async () => undefined,
      pathsExist: async (paths) => paths.map(() => true),
      reveal: unavailable,
      startupFile: async () => null,
      openShow: async () => ({ ok: false, message: 'Opening files needs the desktop app.' }),
      saveShow: async () => ({ ok: false, message: 'Saving needs the desktop app.' }),
      openMediaSet: async () => ({ ok: false, message: 'Opening files needs the desktop app.' }),
      saveMediaSet: async () => ({ ok: false, message: 'Saving needs the desktop app.' }),
      openTeam: async () => ({ ok: false, message: 'Opening files needs the desktop app.' }),
      saveTeam: async () => ({ ok: false, message: 'Saving needs the desktop app.' }),
    },
    dialogs: {
      chooseMedia: async () => {
        extra += 1;
        return [`/Demo/Added/new-sponsor-${extra}.png`];
      },
      chooseFolder: async () => null,
      chooseShowToOpen: async () => null,
      chooseShowToSave: async () => null,
      chooseTeamToOpen: async () => null,
      chooseTeamToSave: async () => null,
      chooseMediaSetToOpen: async () => null,
      chooseMediaSetToSave: async () => null,
    },
    preflight: {
      check: async (items) => ({ total: items.length, ready: items.length, failed: [] }),
      invalidate: () => undefined,
    },
    prefs: {
      read: async () => prefs,
      write: (next) => {
        prefs = next;
      },
      flush: async (next) => {
        prefs = next;
      },
    },
    recovery: {
      read: async () => null,
      write: async () => undefined,
      discard: async () => undefined,
    },
    updates: { check: async () => null, openReleases: async () => undefined },
    window: {
      setTitle: async (title) => {
        document.title = title;
      },
      reveal: async () => undefined,
      geometry: async () => ({ width: 2400, height: 1600, x: 200, y: 100 }),
      restoreGeometry: async () => undefined,
      quit: async () => undefined,
    },
    events: {
      onMenu: async () => () => undefined,
      onPresentationKey: async () => () => undefined,
      onFileDrag: async () => () => undefined,
      onCloseRequested: async () => () => undefined,
    },
  };
}
