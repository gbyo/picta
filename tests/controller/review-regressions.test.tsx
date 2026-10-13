// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getState, setState } from '../../src/controller/state/store.js';
import { goLive, stopOutput } from '../../src/controller/actions/output.js';
import { removePlayer } from '../../src/controller/actions/team.js';
import { sampleShow, startApp, type Started } from './harness.js';

let app: Started | null = null;

/** Sonner keeps toasts in a module-level store, so match the toast by its text. */
function findToast(text: RegExp): Promise<HTMLElement> {
  return waitFor(() => {
    const toast = [...document.querySelectorAll<HTMLElement>('[data-sonner-toast]')].find((item) =>
      text.test(item.textContent ?? ''),
    );
    if (!toast) throw new Error(`No toast matching ${text}`);
    return toast;
  });
}
afterEach(() => {
  app?.dispose();
  app = null;
});

describe('Go Live races', () => {
  it('a stop while preparing leaves nothing running and never shows ON AIR', async () => {
    app = await startApp({ output: { stageDelayMs: 40 } });
    const pending = goLive();
    await waitFor(() => expect(getState().output.stage).toBe('renderer'));
    await act(() => stopOutput());
    await act(async () => {
      await pending;
    });
    expect(getState().output.phase).toBe('off');
    expect(app.platform.output.active).toBe(false);
    expect(app.platform.mocks.show).not.toHaveBeenCalled();
    expect(app.platform.mocks.close).toHaveBeenCalled();
  });

  it('a stop while the window is being revealed does not end up ON AIR', async () => {
    app = await startApp();
    let reveal: () => void = () => undefined;
    app.platform.mocks.show.mockImplementationOnce(
      (id: string) => new Promise((resolve) => (reveal = () => resolve({ id } as never))),
    );
    const pending = goLive();
    await waitFor(() => expect(getState().output.stage).toBe('revealing'));
    await act(() => stopOutput());
    await act(async () => {
      reveal();
      await pending;
    });
    expect(getState().output.phase).toBe('off');
    expect(app.platform.output.active).toBe(false);
  });

  it('pushes a point scored while preparing once the output is live', async () => {
    app = await startApp({ output: { stageDelayMs: 30 } });
    const pending = goLive();
    await waitFor(() => expect(getState().output.stage).toBe('renderer'));
    fireEvent.keyDown(document.body, { key: 'q' });
    await act(async () => {
      await pending;
    });
    expect(getState().output.phase).toBe('live');
    expect(app.platform.output.callsTo('setScore').at(-1)!.args[0]).toMatchObject({
      homePoints: 1,
    });
  });

  it('goes live on the Screen armed while preparing', async () => {
    app = await startApp({ output: { stageDelayMs: 30 } });
    const pending = goLive();
    await waitFor(() => expect(getState().output.stage).toBe('renderer'));
    fireEvent.keyDown(document.body, { key: '4' });
    await act(async () => {
      await pending;
    });
    expect(getState().output.liveScreenId).toBe('full-score');
    const applied = app.platform.output.callsTo('applyScreen').at(-1)!;
    expect((applied.args[0] as { id: string }).id).toBe('full-score');
  });
});

describe('Undo toasts reverse only their own change', () => {
  it('End Set Undo does not undo a later rally', async () => {
    const show = sampleShow();
    show.event.score = { ...show.event.score!, homePoints: 25, awayPoints: 20 };
    app = await startApp({ show });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'End set 1' }));
    fireEvent.keyDown(document.body, { key: 'p' });
    const toast = await findToast(/Set 1 to Wildcats/);
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(getState().doc.show.data.event.score).toMatchObject({ homeSets: 1, awayPoints: 1 });
  });

  it('restoring a removed player keeps the score and their own counters', async () => {
    const show = sampleShow();
    show.event.stats = { p2: { kills: 4, attempts: 6 } };
    app = await startApp({ show });
    act(() => removePlayer('p2'));
    fireEvent.keyDown(document.body, { key: 'q' });
    const toast = await findToast(/Removed #2 Bea/);
    await userEvent.setup().click(within(toast).getByRole('button', { name: 'Undo' }));
    const data = getState().doc.show.data;
    expect(data.event.score!.homePoints).toBe(1);
    expect(data.event.stats['p2']).toMatchObject({ kills: 4 });
    expect(data.team!.data!.players[1]!.id).toBe('p2');
    expect(data.team!.data!.groups[0]!.playerIds).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('opening another show while live', () => {
  it('arms the new show’s default Screen, not the old live one', async () => {
    app = await startApp();
    await act(async () => {
      await goLive();
    });
    fireEvent.keyDown(document.body, { key: '4' });
    const stopping = stopOutput();
    // Another show replaces this one while the window is closing.
    act(() => {
      const next = sampleShow();
      setState((state) => ({
        doc: { ...state.doc, show: { filePath: '/x.picta', data: next, dirty: false } },
        armedScreenId: next.defaultScreenId,
      }));
    });
    await act(() => stopping);
    expect(getState().armedScreenId).toBe('media-score');
  });
});
