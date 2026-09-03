import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultMediaSet } from '../src/core/media.js';
import { FULL_LAYOUT } from '../src/core/layouts.js';
import { screenFromTemplate } from '../src/core/screens.js';
import {
  EVENT_BACKGROUND,
  EVENT_READY,
  EVENT_READY_REQUEST,
  EVENT_RESULT,
  EVENT_SCREEN,
  EVENT_SCREEN_READY,
} from '../src/app/events.js';
import { OutputController, SCREEN_READY_TIMEOUT_MS } from '../src/app/output-controller.js';

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: never }) => void>(),
  emitTo: vi.fn<(target: string, event: string, payload?: unknown) => Promise<void>>(() =>
    Promise.resolve(),
  ),
  listen: vi.fn((name: string, callback: (event: { payload: never }) => void) => {
    mocks.listeners.set(name, callback);
    return () => mocks.listeners.delete(name);
  }),
}));
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => `asset://${path}` }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: mocks.emitTo, listen: mocks.listen }));

function send(name: string, payload: unknown): void {
  mocks.listeners.get(name)?.({ payload: payload as never });
}

function lastPayload(eventName: string): Record<string, unknown> {
  const call = mocks.emitTo.mock.calls.filter((call) => call[1] === eventName).at(-1);
  if (!call) throw new Error(`No ${eventName} event`);
  return call[2] as Record<string, unknown>;
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.listeners.clear();
  mocks.emitTo.mockReset();
  mocks.emitTo.mockResolvedValue(undefined);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis });
});

describe('v3 output Screen startup', () => {
  it('fails closed when panels never acknowledge mounting', async () => {
    const controller = new OutputController({
      onPosition: () => undefined,
      onStopped: () => undefined,
      onCueState: () => undefined,
      onWarning: () => undefined,
    });
    await controller.init();
    const pending = controller.begin(defaultMediaSet('Empty'), {
      intervalSeconds: 10,
      transition: 'none',
      imageSizing: 'fit',
      layout: FULL_LAYOUT,
      screen: screenFromTemplate('full', 'Score', 'score', [{ kind: 'score' }]),
    });
    send(EVENT_READY, lastPayload(EVENT_READY_REQUEST));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(SCREEN_READY_TIMEOUT_MS + 1);
    await expect(pending).resolves.toBe(false);
    expect(controller.active).toBe(false);
    expect(controller.lastBeginFailure).toBe('screen-not-ready');
  });

  it('preserves media across Score/Stats switches and resumes after Full Score', async () => {
    const controller = new OutputController({
      onPosition: () => undefined,
      onStopped: () => undefined,
      onCueState: () => undefined,
      onWarning: () => undefined,
    });
    await controller.init();
    const set = defaultMediaSet('Media');
    set.items = [{ id: 'one', type: 'image', path: '/one.png' }];
    const mediaScore = screenFromTemplate('half-left-right', 'Media + Score', 'media-score');
    const pending = controller.begin(set, {
      intervalSeconds: 10,
      transition: 'none',
      imageSizing: 'fit',
      layout: FULL_LAYOUT,
      screen: mediaScore,
    });
    send(EVENT_READY, lastPayload(EVENT_READY_REQUEST));
    await flushPromises();
    const sessionToken = lastPayload(EVENT_SCREEN)['sessionToken'] as number;
    send(EVENT_SCREEN_READY, { sessionToken, panelIds: ['panel-left', 'panel-right'] });
    await flushPromises();
    const first = lastPayload(EVENT_BACKGROUND);
    send(EVENT_RESULT, { token: first['token'], ok: true, sessionToken, panelId: 'panel-left' });
    await expect(pending).resolves.toBe(true);
    const dispatchCount = () =>
      mocks.emitTo.mock.calls.filter((call) => call[1] === EVENT_BACKGROUND).length;
    controller.applyScreen(
      screenFromTemplate('half-left-right', 'Media + Stats', 'media-stats', [
        { kind: 'media' },
        { kind: 'stats' },
      ]),
    );
    await flushPromises();
    expect(dispatchCount()).toBe(1);
    controller.applyScreen(
      screenFromTemplate('full', 'Full Score', 'full-score', [{ kind: 'score' }]),
    );
    await flushPromises();
    controller.next();
    expect(controller.active).toBe(true);
    controller.applyScreen(mediaScore);
    await flushPromises();
    expect(dispatchCount()).toBe(2);
    expect(lastPayload(EVENT_BACKGROUND)).toMatchObject({
      panelId: 'panel-left',
      src: first['src'],
    });
  });
  it('waits for correlated panel mount before completing a score-only start', async () => {
    const controller = new OutputController({
      onPosition: () => undefined,
      onStopped: () => undefined,
      onCueState: () => undefined,
      onWarning: () => undefined,
    });
    await controller.init();
    const screen = screenFromTemplate('full', 'Score', 'score', [{ kind: 'score' }]);
    let settled = false;
    const pending = controller
      .begin(defaultMediaSet('Empty'), {
        intervalSeconds: 10,
        transition: 'none',
        imageSizing: 'fit',
        layout: FULL_LAYOUT,
        screen,
      })
      .then((value) => {
        settled = true;
        return value;
      });
    const ready = lastPayload(EVENT_READY_REQUEST);
    send(EVENT_READY, ready);
    await flushPromises();
    expect(lastPayload(EVENT_SCREEN)).toMatchObject({ screen });
    expect(settled).toBe(false);
    const sessionToken = lastPayload(EVENT_SCREEN)['sessionToken'] as number;
    send(EVENT_SCREEN_READY, { sessionToken: sessionToken - 1, panelIds: ['panel-1'] });
    await flushPromises();
    expect(settled).toBe(false);
    send(EVENT_SCREEN_READY, { sessionToken, panelIds: ['panel-1'] });
    await expect(pending).resolves.toBe(true);
  });

  it('waits for initial media readiness after the Screen is mounted', async () => {
    const controller = new OutputController({
      onPosition: () => undefined,
      onStopped: () => undefined,
      onCueState: () => undefined,
      onWarning: () => undefined,
    });
    await controller.init();
    const set = defaultMediaSet('Media');
    set.items = [{ id: 'one', type: 'image', path: '/one.png' }];
    const screen = screenFromTemplate('full', 'Media', 'media', [{ kind: 'media' }]);
    const pending = controller.begin(set, {
      intervalSeconds: 10,
      transition: 'none',
      imageSizing: 'fit',
      layout: FULL_LAYOUT,
      screen,
    });
    send(EVENT_READY, lastPayload(EVENT_READY_REQUEST));
    await flushPromises();
    const sessionToken = lastPayload(EVENT_SCREEN)['sessionToken'] as number;
    send(EVENT_SCREEN_READY, { sessionToken, panelIds: ['panel-1'] });
    await flushPromises();
    const media = lastPayload(EVENT_BACKGROUND);
    expect(media).toMatchObject({ sessionToken, panelId: 'panel-1' });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await flushPromises();
    expect(settled).toBe(false);
    send(EVENT_RESULT, { token: media['token'], ok: true, sessionToken, panelId: 'panel-1' });
    await expect(pending).resolves.toBe(true);
  });
});
