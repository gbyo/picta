/**
 * Test harness for the controller: a scripted Platform with a FakeOutput, so
 * operator workflows run end to end — React, store, actions and output
 * contract — without Tauri or a presentation window.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';
import type { MediaSet, ShowDocument, Team } from '../../src/core/domain.js';
import type { DisplayInfo } from '../../src/core/monitors.js';
import { defaultShowDocument } from '../../src/core/show-file.js';
import { createScoreHistory, defaultVolleyballScore } from '../../src/core/score.js';
import { emptyPrefs, type Prefs } from '../../src/app/prefs.js';
import type { RecoverySnapshot } from '../../src/app/recovery.js';
import { FakeOutput, type FakeOutputOptions } from '../../src/controller/platform/fake-output.js';
import type { Platform } from '../../src/controller/platform/types.js';
import { boot, install } from '../../src/controller/boot.js';
import { documentFor, resetStore, setState } from '../../src/controller/state/store.js';
import { dialogStore } from '../../src/controller/state/dialogs.js';
import { App } from '../../src/controller/App.js';

export const LAPTOP: DisplayInfo = {
  id: 'laptop',
  index: 1,
  name: 'Built-in',
  width: 1512,
  height: 982,
  x: 0,
  y: 0,
  scaleFactor: 2,
  isPrimary: true,
};

export const TV: DisplayInfo = {
  id: 'tv',
  index: 2,
  name: 'Scoreboard TV',
  width: 1920,
  height: 1080,
  x: 1512,
  y: 0,
  scaleFactor: 1,
  isPrimary: false,
};

export function sampleTeam(): Team {
  const players = [
    ['1', 'Ada', 'S'],
    ['2', 'Bea', 'OH'],
    ['3', 'Cleo', 'MB'],
    ['4', 'Dot', 'OPP'],
    ['5', 'Eve', 'L'],
    ['6', 'Fay', 'OH'],
    ['7', 'Gia', 'DS'],
  ].map(([number, name, position], index) => ({
    id: `p${index + 1}`,
    number: number!,
    name: name!,
    position: position!,
    media: index === 1 ? { introVideo: { path: '/media/bea.mp4' } } : {},
  }));
  return {
    version: 1,
    id: 'team',
    name: 'Wildcats',
    sport: 'volleyball',
    colors: { primary: '#004b32', secondary: '#ffffff' },
    players,
    groups: [
      {
        id: 'starting-lineup',
        name: 'Starting Lineup',
        playerIds: ['p1', 'p2', 'p3'],
        maxPlayers: 6,
      },
      {
        id: 'on-court',
        name: 'On Court',
        playerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
        maxPlayers: 6,
      },
    ],
  };
}

export function sampleMedia(): MediaSet {
  return {
    version: 1,
    name: 'Sponsors',
    items: [
      { id: 'm1', type: 'image', path: '/media/one.png' },
      { id: 'm2', type: 'image', path: '/media/two.png', durationSeconds: 15 },
      { id: 'm3', type: 'video', path: '/media/three.mp4' },
    ],
    transition: 'crossfade',
    imageSizing: 'fit',
    imageDurationSeconds: 10,
  };
}

export function sampleShow(options: { team?: boolean; media?: MediaSet } = {}): ShowDocument {
  const base = defaultShowDocument();
  const team = options.team === false ? undefined : sampleTeam();
  return {
    ...base,
    media: { kind: 'inline', data: options.media ?? sampleMedia() },
    ...(team ? { team: { kind: 'inline' as const, data: team } } : {}),
    event: { stats: {}, liveGroups: {}, score: defaultVolleyballScore(team) },
  };
}

export interface TestPlatform extends Platform {
  output: FakeOutput;
  mocks: {
    prepare: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    saveShow: ReturnType<typeof vi.fn>;
    chooseShowToSave: ReturnType<typeof vi.fn>;
    recoveryWrite: ReturnType<typeof vi.fn>;
    recoveryDiscard: ReturnType<typeof vi.fn>;
    setTitle: ReturnType<typeof vi.fn>;
    chooseFolder: ReturnType<typeof vi.fn>;
    pathsExist: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
  };
  emitMenu(id: string): void;
  emitPresentationKey(key: string): void;
  emitFileDrag: Parameters<Platform['events']['onFileDrag']>[0];
  requestClose(): Promise<void>;
}

export interface PlatformOptions {
  displays?: DisplayInfo[];
  prefs?: Partial<Prefs>;
  recovery?: RecoverySnapshot | null;
  output?: FakeOutputOptions;
  preflightFailures?: string[];
}

export function createTestPlatform(options: PlatformOptions = {}): TestPlatform {
  let displays = options.displays ?? [LAPTOP, TV];
  let menu: (id: string) => void = () => undefined;
  let key: (key: string) => void = () => undefined;
  let drag: Parameters<Platform['events']['onFileDrag']>[0] = () => undefined;
  let close: () => Promise<void> = async () => undefined;
  let output: FakeOutput | null = null;
  const mocks = {
    prepare: vi.fn(async (id: string) => displays.find((display) => display.id === id)!),
    show: vi.fn(async (id: string) => displays.find((display) => display.id === id)!),
    close: vi.fn(async () => undefined),
    list: vi.fn(async () => displays),
    saveShow: vi.fn(async () => ({ ok: true as const })),
    chooseShowToSave: vi.fn(async () => '/shows/Game Night.picta'),
    recoveryWrite: vi.fn(async () => undefined),
    recoveryDiscard: vi.fn(async () => undefined),
    setTitle: vi.fn(async () => undefined),
    chooseFolder: vi.fn(async () => null as string | null),
    pathsExist: vi.fn(async (paths: string[]) => paths.map(() => true)),
    quit: vi.fn(async () => undefined),
  };
  const platform: TestPlatform = {
    native: true,
    get output() {
      if (!output) throw new Error('Output not created');
      return output;
    },
    mocks,
    pathStyle: async () => 'posix',
    assetUrl: (path) => `asset://${path}`,
    createOutput: (handlers) => {
      output = new FakeOutput(handlers, options.output ?? {});
      return output;
    },
    displays: { list: mocks.list, identify: async () => undefined },
    presentation: { prepare: mocks.prepare, show: mocks.show, close: mocks.close },
    files: {
      allowMedia: async () => undefined,
      pathsExist: mocks.pathsExist,
      reveal: async () => undefined,
      startupFile: async () => null,
      openShow: async () => ({ ok: false, message: 'not in tests' }),
      saveShow: mocks.saveShow,
      openMediaSet: async () => ({ ok: false, message: 'not in tests' }),
      saveMediaSet: async () => ({ ok: true }),
      openTeam: async () => ({ ok: false, message: 'not in tests' }),
      saveTeam: async () => ({ ok: true }),
    },
    dialogs: {
      chooseMedia: async () => [],
      chooseFolder: mocks.chooseFolder,
      chooseShowToOpen: async () => null,
      chooseShowToSave: mocks.chooseShowToSave,
      chooseTeamToOpen: async () => null,
      chooseTeamToSave: async () => null,
      chooseMediaSetToOpen: async () => null,
      chooseMediaSetToSave: async () => null,
    },
    preflight: {
      check: async (items) => {
        const failed = items
          .filter((item) => item.missing || options.preflightFailures?.includes(item.id))
          .map((item) => ({
            id: item.id,
            path: item.path,
            message: item.missing
              ? 'The file is missing.'
              : 'The video could not be loaded by this WebView.',
          }));
        return { total: items.length, ready: items.length - failed.length, failed };
      },
      invalidate: () => undefined,
    },
    prefs: {
      read: async () => ({ ...emptyPrefs, ...options.prefs }),
      write: () => undefined,
      flush: async () => undefined,
    },
    recovery: {
      read: async () => options.recovery ?? null,
      write: mocks.recoveryWrite,
      discard: mocks.recoveryDiscard,
    },
    updates: { check: async () => null, openReleases: async () => undefined },
    window: {
      setTitle: mocks.setTitle,
      reveal: async () => undefined,
      geometry: async () => ({ width: 1180, height: 820, x: 100, y: 80 }),
      restoreGeometry: async () => undefined,
      quit: mocks.quit,
    },
    events: {
      onMenu: async (handler) => {
        menu = handler;
        return () => {
          menu = () => undefined;
        };
      },
      onPresentationKey: async (handler) => {
        key = handler;
        return () => undefined;
      },
      onFileDrag: async (handler) => {
        drag = handler;
        return () => undefined;
      },
      onCloseRequested: async (handler) => {
        close = handler;
        return () => undefined;
      },
    },
    emitMenu: (id) => menu(id),
    emitPresentationKey: (value) => key(value),
    emitFileDrag: (event) => drag(event),
    requestClose: () => close(),
  };
  // Allow tests to change the topology mid-run.
  (platform as TestPlatform & { setDisplays(next: DisplayInfo[]): void }).setDisplays = (next) => {
    displays = next;
  };
  return platform;
}

export function setDisplays(platform: TestPlatform, next: DisplayInfo[]): void {
  (platform as TestPlatform & { setDisplays(next: DisplayInfo[]): void }).setDisplays(next);
}

export interface Started {
  platform: TestPlatform;
  dispose: () => void;
}

/** Install a fresh runtime, seed a show, boot and render the whole controller. */
export async function startApp(
  options: PlatformOptions & { show?: ShowDocument; selectTv?: boolean } = {},
): Promise<Started> {
  resetStore();
  dialogStore.setState({ queue: [] });
  const platform = createTestPlatform(options);
  install(platform);
  const show = options.show ?? sampleShow();
  setState({
    doc: documentFor(show),
    armedScreenId: show.defaultScreenId,
    scoreHistory: createScoreHistory(show.event.score ?? defaultVolleyballScore()),
  });
  render(<App />);
  const dispose = await boot({
    watchDisplays: false,
    checkUpdates: false,
    restoreSession: options.recovery !== undefined,
  });
  if (options.selectTv !== false) setState({ selectedDisplayId: TV.id });
  return { platform, dispose };
}

export async function goLiveFromUi(): Promise<void> {
  const { default: userEvent } = await import('@testing-library/user-event');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Go Live' }));
  await waitFor(() => expect(screen.getByRole('status', { name: 'On air' })).toBeInTheDocument());
}
