import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { defaultMediaSet } from '../src/core/media.js';
import { FULL_LAYOUT, HALF_HALF_LAYOUT } from '../src/core/layouts.js';
import {
  EVENT_BACKGROUND,
  EVENT_CUE_END,
  EVENT_LAYOUT,
  EVENT_READY,
  EVENT_READY_REQUEST,
  EVENT_RESULT,
  EVENT_PLAYBACK,
} from '../src/app/events.js';
import {
  OutputController,
  READY_TIMEOUT_MS,
  type OutputHandlers,
} from '../src/app/output-controller.js';
import type { Cue, MediaSet } from '../src/core/domain.js';

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  emitTo: vi.fn<(target: string, event: string, payload?: unknown) => Promise<void>>(() =>
    Promise.resolve(),
  ),
  listen: vi.fn((name: string, callback: (event: { payload: unknown }) => void) => {
    mocks.listeners.set(name, callback);
    return () => mocks.listeners.delete(name);
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: mocks.emitTo, listen: mocks.listen }));

const settings = {
  intervalSeconds: 10,
  transition: 'crossfade' as const,
  imageSizing: 'fit' as const,
  layout: FULL_LAYOUT,
};

function mediaSet(type: 'image' | 'video' = 'image'): MediaSet {
  return {
    ...defaultMediaSet('Output tests'),
    items: [{ id: 'item', type, path: type === 'image' ? '/image.png' : '/video.mp4' }],
  };
}

function handlers(): OutputHandlers & {
  warnings: string[];
  stopped: string[];
  positions: number[];
} {
  const warnings: string[] = [];
  const stopped: string[] = [];
  const positions: number[] = [];
  return {
    warnings,
    stopped,
    positions,
    onPosition: (position) => positions.push(position),
    onStopped: (reason) => stopped.push(reason),
    onCueState: () => undefined,
    onWarning: (message) => warnings.push(message),
  };
}

function send(name: string, payload: unknown): void {
  mocks.listeners.get(name)?.({ payload });
}

function readyRequest(): { token: number } {
  const call = [...mocks.emitTo.mock.calls]
    .reverse()
    .find((candidate) => candidate[1] === EVENT_READY_REQUEST);
  if (!call) throw new Error('no readiness request was emitted');
  return call[2] as { token: number };
}

function backgroundRequest(): { token: number; sessionToken: number } {
  const calls = mocks.emitTo.mock.calls.filter(([, event]) => event === EVENT_BACKGROUND);
  const payload = calls.at(-1)?.[2] as { token: number; sessionToken: number } | undefined;
  if (!payload) throw new Error('no background request was emitted');
  return payload;
}

async function beginReady(
  controller: OutputController,
  set: MediaSet = defaultMediaSet('Empty'),
): Promise<boolean> {
  const pending = controller.begin(set, settings);
  const request = readyRequest();
  send(EVENT_READY, request);
  return pending;
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.listeners.clear();
  mocks.emitTo.mockReset();
  mocks.emitTo.mockResolvedValue(undefined);
  mocks.listen.mockClear();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: globalThis,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OutputController readiness and run boundaries', () => {
  it('starts only after the correlated presentation ready event', async () => {
    const controller = new OutputController(handlers());
    await controller.init();
    const pending = controller.begin(defaultMediaSet('Empty'), settings);
    const request = readyRequest();
    expect(request.token).toBeGreaterThan(0);
    expect(controller.active).toBe(false);
    send(EVENT_READY, { token: request.token - 1 });
    expect(controller.active).toBe(false);
    send(EVENT_READY, request);
    await expect(pending).resolves.toBe(true);
    expect(controller.active).toBe(true);
  });

  it('fails a readiness timeout, ignores a late ready, and can retry', async () => {
    const state = handlers();
    const controller = new OutputController(state);
    await controller.init();
    const first = controller.begin(defaultMediaSet('Empty'), settings);
    const oldRequest = readyRequest();
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS);
    await expect(first).resolves.toBe(false);
    expect(controller.active).toBe(false);
    expect(controller.lastBeginFailure).toBe('presentation-not-ready');
    expect(state.warnings).toContain('The output window did not finish starting.');
    send(EVENT_READY, oldRequest);
    expect(controller.active).toBe(false);

    const retry = controller.begin(defaultMediaSet('Empty'), settings);
    const newRequest = readyRequest();
    expect(newRequest.token).not.toBe(oldRequest.token);
    send(EVENT_READY, oldRequest);
    expect(controller.active).toBe(false);
    send(EVENT_READY, newRequest);
    await expect(retry).resolves.toBe(true);
    expect(controller.active).toBe(true);
  });

  it('keeps a failed renderer start inactive and closes its presentation path', async () => {
    const state = handlers();
    const controller = new OutputController(state);
    await controller.init();
    mocks.emitTo.mockImplementation((_, event) =>
      event === EVENT_LAYOUT
        ? Promise.reject(new Error('renderer disappeared'))
        : Promise.resolve(),
    );
    const pending = controller.begin(defaultMediaSet('Empty'), settings);
    send(EVENT_READY, readyRequest());
    await expect(pending).resolves.toBe(false);
    expect(controller.active).toBe(false);
    expect(controller.lastBeginFailure).toBe('presentation-unavailable');
    expect(mocks.emitTo.mock.calls.some(([, event]) => event === 'picta://present-clear')).toBe(
      true,
    );
  });

  it('separates start-stop-start sessions and ignores stale playback tokens', async () => {
    const state = handlers();
    const controller = new OutputController(state);
    await controller.init();
    await expect(beginReady(controller, mediaSet('video'))).resolves.toBe(true);
    const first = backgroundRequest();
    controller.stop();

    const secondStart = controller.begin(mediaSet('video'), settings);
    const secondReady = readyRequest();
    send(EVENT_READY, secondReady);
    await expect(secondStart).resolves.toBe(true);
    const second = backgroundRequest();
    expect(second.sessionToken).not.toBe(first.sessionToken);

    send(EVENT_PLAYBACK, {
      token: first.token,
      event: 'ended',
      ok: true,
      sessionToken: first.sessionToken,
    });
    expect(backgroundRequest()).toEqual(second);
    send(EVENT_RESULT, { token: second.token, ok: true, sessionToken: second.sessionToken });
    send(EVENT_PLAYBACK, {
      token: second.token,
      event: 'ended',
      ok: true,
      sessionToken: second.sessionToken,
    });
    expect(backgroundRequest().token).not.toBe(second.token);
    expect(controller.active).toBe(true);
  });

  it('skips renderer media failures while retaining valid items', async () => {
    const state = handlers();
    const controller = new OutputController(state);
    await controller.init();
    const set: MediaSet = {
      ...mediaSet('image'),
      items: [
        { id: 'bad', type: 'image', path: '/bad.png' },
        { id: 'good', type: 'image', path: '/good.png' },
      ],
    };
    await expect(beginReady(controller, set)).resolves.toBe(true);
    const failed = backgroundRequest();
    send(EVENT_RESULT, {
      token: failed.token,
      ok: false,
      sessionToken: failed.sessionToken,
    });
    expect(state.warnings).toContain('Skipped bad.png because it could not play.');
    expect(backgroundRequest().token).not.toBe(failed.token);
    expect(controller.active).toBe(true);
  });

  it('stops when the presentation disappears during playback', async () => {
    const state = handlers();
    const controller = new OutputController(state);
    await controller.init();
    await expect(beginReady(controller, mediaSet())).resolves.toBe(true);
    mocks.emitTo.mockImplementation((_, event) =>
      event === EVENT_BACKGROUND ? Promise.reject(new Error('window closed')) : Promise.resolve(),
    );
    controller.next();
    await Promise.resolve();
    expect(controller.active).toBe(false);
    expect(state.stopped).toContain('display-lost');
  });

  it('cancels a cue and prevents its late completion from changing playback', async () => {
    const state = handlers();
    const controller = new OutputController(state);
    await controller.init();
    await expect(beginReady(controller)).resolves.toBe(true);
    const cue: Cue = {
      type: 'player-card',
      playerId: 'p1',
      target: 'program',
      holdMs: 1000,
      number: '1',
      name: 'Player',
      position: 'OH',
      stats: [],
    };
    const pending = controller.playCue(cue, { kind: 'single-player', label: '#1 Player' });
    await Promise.resolve();
    controller.cancelCue();
    await expect(pending).resolves.toBe('cancelled');
    expect(mocks.emitTo.mock.calls.some(([, event]) => event === EVENT_CUE_END)).toBe(true);
  });

  it('updates layout only while live and keeps output recoverable after a timeout', async () => {
    const controller = new OutputController(handlers());
    await controller.init();
    controller.setLayout(HALF_HALF_LAYOUT);
    expect(mocks.emitTo.mock.calls.some(([, event]) => event === EVENT_LAYOUT)).toBe(false);
    await expect(beginReady(controller)).resolves.toBe(true);
    controller.setLayout(HALF_HALF_LAYOUT);
    expect(mocks.emitTo.mock.calls.some(([, event]) => event === EVENT_LAYOUT)).toBe(true);
    controller.stop();
    expect(controller.active).toBe(false);
  });
});
