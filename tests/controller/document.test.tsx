// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getState } from '../../src/controller/state/store.js';
import { createRecoverySnapshot } from '../../src/app/recovery.js';
import { sampleShow, startApp, type Started } from './harness.js';

let app: Started | null = null;
afterEach(() => {
  app?.dispose();
  app = null;
});

describe('document dirty state', () => {
  it('starts clean and marks the show and title unsaved after an edit', async () => {
    app = await startApp();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'q' });
    expect(getState().doc.show.dirty).toBe(true);
    await waitFor(() =>
      expect(app!.platform.mocks.setTitle).toHaveBeenLastCalledWith('• Untitled Show — Picta'),
    );
    expect(screen.getByText(/Unsaved · Untitled\.picta/)).toBeInTheDocument();
  });

  it('switching Screens and moving through media never dirties the show', async () => {
    app = await startApp();
    fireEvent.keyDown(document.body, { key: '2' });
    expect(getState().doc.show.dirty).toBe(false);
  });

  it('saves through the native Save As dialog and becomes clean', async () => {
    app = await startApp();
    fireEvent.keyDown(document.body, { key: 'q' });
    act(() => app!.platform.emitMenu('save'));
    await waitFor(() => expect(app!.platform.mocks.saveShow).toHaveBeenCalled());
    expect(app.platform.mocks.chooseShowToSave).toHaveBeenCalled();
    await waitFor(() => expect(getState().doc.show.dirty).toBe(false));
    expect(getState().doc.show.filePath).toBe('/shows/Game Night.picta');
    expect(getState().doc.mediaDirty).toBe(false);
  });

  it('keeps the old path and stays dirty when a save fails', async () => {
    app = await startApp();
    app.platform.mocks.saveShow.mockResolvedValueOnce({ ok: false, message: 'Disk full' });
    fireEvent.keyDown(document.body, { key: 'q' });
    act(() => app!.platform.emitMenu('save'));
    await waitFor(() => expect(app!.platform.mocks.saveShow).toHaveBeenCalled());
    expect(getState().doc.show.dirty).toBe(true);
    expect(getState().doc.show.filePath).toBeNull();
  });

  it('asks before replacing unsaved work with a new show, and Cancel keeps it', async () => {
    app = await startApp();
    fireEvent.keyDown(document.body, { key: 'q' });
    act(() => app!.platform.emitMenu('new'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Save changes before starting a new show?');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(getState().doc.show.data.event.score!.homePoints).toBe(1);
  });

  it("discards on Don't Save and starts a clean show", async () => {
    app = await startApp();
    fireEvent.keyDown(document.body, { key: 'q' });
    act(() => app!.platform.emitMenu('new'));
    await userEvent
      .setup()
      .click(within(await screen.findByRole('dialog')).getByRole('button', { name: "Don't Save" }));
    await waitFor(() => expect(getState().doc.show.dirty).toBe(false));
    expect(getState().doc.show.data.team).toBeUndefined();
  });

  it('writes crash recovery while dirty', async () => {
    app = await startApp();
    fireEvent.keyDown(document.body, { key: 'q' });
    await waitFor(() => expect(app!.platform.mocks.recoveryWrite).toHaveBeenCalled(), {
      timeout: 2500,
    });
    const snapshot = app.platform.mocks.recoveryWrite.mock.calls.at(-1)![0];
    expect(snapshot).toMatchObject({ showDirty: true, version: 1 });
  });
});

describe('crash recovery', () => {
  it('offers to recover unsaved work at startup', async () => {
    const show = sampleShow();
    show.event.score = { ...show.event.score!, homePoints: 9 };
    const snapshot = createRecoverySnapshot({
      show: { filePath: null, data: show, dirty: true },
      mediaFilePath: null,
      mediaDirty: false,
      teamFilePath: null,
      teamDirty: false,
    });
    const boot = startApp({ recovery: snapshot });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Recover unsaved work?');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Recover' }));
    app = await boot;
    expect(getState().doc.show.data.event.score!.homePoints).toBe(9);
    expect(getState().doc.show.dirty).toBe(true);
  });

  it('discards recovery the operator declines', async () => {
    const snapshot = createRecoverySnapshot({
      show: { filePath: null, data: sampleShow(), dirty: true },
      mediaFilePath: null,
      mediaDirty: false,
      teamFilePath: null,
      teamDirty: false,
    });
    const boot = startApp({ recovery: snapshot });
    await userEvent
      .setup()
      .click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard' }));
    app = await boot;
    expect(app.platform.mocks.recoveryDiscard).toHaveBeenCalled();
    expect(getState().doc.show.dirty).toBe(false);
  });
});

describe('quitting', () => {
  it('saves or asks first, then stops output, clears recovery and closes the presentation', async () => {
    app = await startApp();
    await act(() => app!.platform.requestClose());
    expect(app.platform.mocks.recoveryDiscard).toHaveBeenCalled();
    expect(app.platform.mocks.close).toHaveBeenCalled();
    expect(app.platform.mocks.quit).toHaveBeenCalled();
  });

  it('does not quit when the operator cancels the save prompt', async () => {
    app = await startApp();
    fireEvent.keyDown(document.body, { key: 'q' });
    const closing = app.platform.requestClose();
    await userEvent
      .setup()
      .click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await closing;
    expect(app.platform.mocks.quit).not.toHaveBeenCalled();
  });
});
