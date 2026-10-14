// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getState } from '../../src/controller/state/store.js';
import { refreshDisplays } from '../../src/controller/actions/output.js';
import { goLiveFromUi, LAPTOP, setDisplays, startApp, TV, type Started } from './harness.js';

let app: Started | null = null;
afterEach(() => {
  app?.dispose();
  app = null;
});

describe('taking output live', () => {
  it('prepares hidden, starts the armed Screen, then reveals and shows ON AIR', async () => {
    app = await startApp();
    const { platform } = app;
    await goLiveFromUi();

    expect(platform.mocks.prepare).toHaveBeenCalledWith('tv');
    expect(platform.mocks.show).toHaveBeenCalledWith('tv');
    // Reveal only after the output began.
    expect(platform.mocks.prepare.mock.invocationCallOrder[0]!).toBeLessThan(
      platform.mocks.show.mock.invocationCallOrder[0]!,
    );
    const begin = platform.output.callsTo('begin')[0]!;
    const settings = begin.args[1] as { screen: { id: string } };
    expect(settings.screen.id).toBe('media-score');
    expect(getState().output.liveScreenId).toBe('media-score');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.getByText('PROGRAM')).toBeInTheDocument();
  });

  it('refuses to start without a display and says why', async () => {
    app = await startApp({ selectTv: false });
    expect(screen.getByRole('button', { name: 'Go Live' })).toBeDisabled();
    expect(screen.getByText('No display chosen')).toBeInTheDocument();
  });

  it('closes the hidden window and stays OFF AIR when the Screen never mounts', async () => {
    app = await startApp({ output: { failWith: 'screen-not-ready' } });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Go Live' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('The Screen did not finish loading'),
    );
    expect(app.platform.mocks.close).toHaveBeenCalled();
    expect(app.platform.mocks.show).not.toHaveBeenCalled();
    expect(getState().output.phase).toBe('off');
    expect(screen.getByRole('status', { name: /Off air/ })).toHaveTextContent('START FAILED');
  });

  it('reports a window that cannot be placed instead of pretending to be live', async () => {
    app = await startApp();
    app.platform.mocks.show.mockRejectedValueOnce(
      new Error('Picta could not place the presentation'),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Go Live' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Output could not start'),
    );
    expect(app.platform.output.callsTo('abandon')).toHaveLength(1);
    expect(app.platform.mocks.close).toHaveBeenCalled();
    expect(getState().output.phase).toBe('off');
  });

  it('skips media that fail preflight and tells the operator', async () => {
    app = await startApp({ preflightFailures: ['m3'] });
    await goLiveFromUi();
    const begin = app.platform.output.callsTo('begin')[0]!;
    const set = begin.args[0] as { items: { id: string; missing?: boolean }[] };
    expect(set.items.find((item) => item.id === 'm3')?.missing).toBe(true);
    expect(getState().output.skippedItemIds).toEqual(['m3']);
  });
});

describe('stopping output', () => {
  it('asks before blanking the display, and does nothing on cancel', async () => {
    app = await startApp();
    await goLiveFromUi();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Stop output?');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(getState().output.phase).toBe('live');
    expect(app.platform.mocks.close).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Stop Output' }),
    );
    await waitFor(() => expect(getState().output.phase).toBe('off'));
    expect(app.platform.output.callsTo('stop').at(-1)!.args[0]).toBe('user');
    expect(app.platform.mocks.close).toHaveBeenCalled();
    // The Screen that was on air stays armed for the next Go Live.
    expect(getState().armedScreenId).toBe('media-score');
  });
});

describe('display changes', () => {
  it('stops cleanly and explains when the output display disappears', async () => {
    app = await startApp();
    await goLiveFromUi();
    setDisplays(app.platform, [LAPTOP]);
    await act(() => refreshDisplays());
    expect(app.platform.output.callsTo('abandon')).toHaveLength(1);
    expect(app.platform.mocks.close).toHaveBeenCalled();
    expect(getState().output.phase).toBe('off');
    expect(screen.getByRole('alert')).toHaveTextContent('The output display disconnected');
  });

  it('reselects the same display when it returns, without going live by itself', async () => {
    app = await startApp({
      prefs: {
        displayHint: {
          fingerprint: 'Scoreboard TV|1920x1080@1',
          name: 'Scoreboard TV',
          width: 1920,
          height: 1080,
          scaleFactor: 1,
          x: 1512,
          y: 0,
        },
      },
    });
    await goLiveFromUi();
    setDisplays(app.platform, [LAPTOP]);
    await act(() => refreshDisplays());
    setDisplays(app.platform, [LAPTOP, TV]);
    await act(() => refreshDisplays());
    expect(getState().selectedDisplayId).toBe('tv');
    expect(getState().output.phase).toBe('off');
  });

  it('handles the output reporting a lost display', async () => {
    app = await startApp();
    await goLiveFromUi();
    await act(async () => app!.platform.output.loseDisplay());
    await waitFor(() => expect(getState().output.phase).toBe('off'));
    expect(app.platform.mocks.close).toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('disconnected');
  });
});
