// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getState, setState } from '../../src/controller/state/store.js';
import { goLiveFromUi, sampleMedia, sampleShow, startApp, type Started } from './harness.js';

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

const items = () => getState().doc.show.data.media.data!.items;

describe('media workspace', () => {
  it('flags missing files and relinks them from a folder', async () => {
    const media = sampleMedia();
    media.items[0] = { ...media.items[0]!, missing: true };
    app = await startApp({ show: sampleShow({ media }) });
    setState({ mode: 'media' });
    expect(await screen.findByText(/1 file was moved or deleted/)).toBeInTheDocument();
    app.platform.mocks.chooseFolder.mockResolvedValueOnce('/moved');
    await userEvent.setup().click(screen.getByRole('button', { name: /Locate/ }));
    await waitFor(() => expect(items()[0]).toMatchObject({ path: '/moved/one.png' }));
    expect(items()[0]!.missing).toBeUndefined();
  });

  it('locks the rotation while ON AIR but keeps Show Now', async () => {
    app = await startApp();
    await goLiveFromUi();
    act(() => setState({ mode: 'media', selectedMediaIds: ['m1'] }));
    expect(await screen.findByText(/The rotation is locked while ON AIR/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Media' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Remove from Rotation/ })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show Now' }));
    const [cues, context] = app.platform.output.callsTo('playCues')[0]!.args as [
      { type: string }[],
      { kind: string },
    ];
    expect(cues[0]!.type).toBe('image');
    expect(context.kind).toBe('single-media');
  });

  it('removes with Undo instead of a confirmation', async () => {
    app = await startApp();
    act(() => setState({ mode: 'media', selectedMediaIds: ['m2'] }));
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /Remove from Rotation/ }));
    expect(items().map((item) => item.id)).toEqual(['m1', 'm3']);
    expect(screen.queryByRole('dialog')).toBeNull();
    const undo = await screen.findByRole('button', { name: 'Undo' });
    await userEvent.setup().click(undo);
    expect(items().map((item) => item.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('reorders from the keyboard with Alt+arrows', async () => {
    app = await startApp();
    act(() => setState({ mode: 'media' }));
    const card = await screen.findByRole('button', { name: /^1\. one\.png/ });
    fireEvent.keyDown(card, { key: 'ArrowRight', altKey: true });
    expect(items().map((item) => item.id)).toEqual(['m2', 'm1', 'm3']);
  });

  it('adds dropped media files and describes the drop first', async () => {
    app = await startApp();
    act(() => app!.platform.emitFileDrag({ type: 'enter', paths: ['/new/a.png', '/new/b.mov'] }));
    expect(await screen.findByText('Add 1 file to the media rotation')).toBeInTheDocument();
    act(() => app!.platform.emitFileDrag({ type: 'drop', paths: ['/new/a.png', '/new/b.mov'] }));
    await waitFor(() => expect(items().map((item) => item.path)).toContain('/new/a.png'));
    expect(items()).toHaveLength(4);
    expect(getState().mode).toBe('media');
  });

  it('refuses dropped media while live, saying why', async () => {
    app = await startApp();
    await goLiveFromUi();
    act(() => app!.platform.emitFileDrag({ type: 'enter', paths: ['/new/a.png'] }));
    expect(await screen.findByText('The rotation is locked while ON AIR')).toBeInTheDocument();
    act(() => app!.platform.emitFileDrag({ type: 'drop', paths: ['/new/a.png'] }));
    expect(items()).toHaveLength(3);
  });
});

describe('screens workspace', () => {
  it('moves the rotation instead of creating a second media panel', async () => {
    app = await startApp();
    act(() =>
      setState({ mode: 'screens', editingScreenId: 'media-score', selectedPanelId: 'panel-right' }),
    );
    const group = await screen.findByRole('group', { name: 'Panel content' });
    await userEvent.setup().click(within(group).getByRole('button', { name: 'Media' }));
    const screenNow = getState().doc.show.data.screens.find((item) => item.id === 'media-score')!;
    expect(screenNow.panels.map((panel) => panel.content.kind)).toEqual(['score', 'media']);
    expect(screenNow.cueTargetPanelId).toBe('panel-right');
    expect(getState().doc.show.dirty).toBe(true);
  });

  it('applies edits to the live Screen immediately and says so', async () => {
    app = await startApp();
    await goLiveFromUi();
    act(() =>
      setState({ mode: 'screens', editingScreenId: 'media-score', selectedPanelId: 'panel-right' }),
    );
    expect(await screen.findByText(/This Screen is on air/)).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Panel content' });
    await userEvent.setup().click(within(group).getByRole('button', { name: 'Stats' }));
    const applied = app.platform.output.callsTo('applyScreen').at(-1)!;
    expect(
      (applied.args[0] as { panels: { content: { kind: string } }[] }).panels[1]!.content.kind,
    ).toBe('stats');
  });

  it('will not delete the Screen on air', async () => {
    app = await startApp();
    await goLiveFromUi();
    act(() => setState({ mode: 'screens', editingScreenId: 'media-score' }));
    expect(await screen.findByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('deletes another Screen with Undo', async () => {
    app = await startApp();
    act(() => setState({ mode: 'screens', editingScreenId: 'full-stats' }));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Delete' }));
    expect(getState().doc.show.data.screens.map((item) => item.id)).not.toContain('full-stats');
    const toast = await findToast(/Deleted the Screen Full Stats/);
    await userEvent.setup().click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(getState().doc.show.data.screens.map((item) => item.id)).toContain('full-stats');
  });
});

describe('roster workspace', () => {
  it('adds players rapidly from the keyboard', async () => {
    app = await startApp();
    act(() => setState({ mode: 'roster' }));
    const user = userEvent.setup();
    // In jsdom every element sits at 0,0, so a synthetic click lands on the
    // panel separator's hit area; focus the fields directly instead.
    const number = await screen.findByRole('textbox', { name: 'New player number' });
    number.focus();
    await user.keyboard('22');
    screen.getByRole('textbox', { name: 'New player name' }).focus();
    await user.keyboard('Hana Ito{Enter}');
    const team = getState().doc.show.data.team!.data!;
    expect(team.players.at(-1)).toMatchObject({ number: '22', name: 'Hana Ito' });
    expect(screen.getByRole('textbox', { name: 'New player number' })).toHaveFocus();
    expect(getState().doc.teamDirty).toBe(true);
  });

  it('imports a pasted roster after showing what will be added', async () => {
    app = await startApp();
    act(() => setState({ mode: 'roster' }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Paste Roster/ }));
    const dialog = await screen.findByRole('dialog');
    const area = within(dialog).getByRole('textbox', { name: 'Roster text' });
    fireEvent.change(area, { target: { value: '30 Ivy Lane OH\n31, Jo March, Setter' } });
    expect(within(dialog).getByText('Ivy Lane')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add 2 Players' }));
    const players = getState().doc.show.data.team!.data!.players;
    expect(players.slice(-2)).toMatchObject([
      { number: '30', name: 'Ivy Lane', position: 'OH' },
      { number: '31', name: 'Jo March', position: 'S' },
    ]);
  });
});
