// @vitest-environment jsdom
/**
 * The interaction structure the Cladd migration introduced: where tasks live
 * (menus hold actions, dialogs hold fields, inspectors hold properties) and
 * how overlays treat focus and shortcuts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getState, setState } from '../../src/controller/state/store.js';
import { setTheme } from '../../src/controller/actions/ui.js';
import { goLiveFromUi, startApp, type Started } from './harness.js';

/** Base UI menus open from the keyboard reliably in jsdom; the pointer path is covered in the browser. */
async function openMenuFromKeyboard(user: ReturnType<typeof userEvent.setup>, name: string) {
  screen.getByRole('button', { name }).focus();
  await user.keyboard('{Enter}');
}

let app: Started | null = null;
afterEach(() => {
  app?.dispose();
  app = null;
});

const score = () => getState().doc.show.data.event.score!;
const mediaSet = () => getState().doc.show.data.media.data!;

describe('theme', () => {
  it('drives Cladd and Picta from one setting', async () => {
    app = await startApp();
    const root = document.documentElement;
    act(() => setTheme('light'));
    await waitFor(() => expect(root).toHaveClass('light'));
    expect(root).not.toHaveClass('dark');
    expect(root.dataset['theme']).toBe('light');
    act(() => setTheme('dark'));
    await waitFor(() => expect(root).toHaveClass('dark'));
    expect(root.dataset['theme']).toBe('dark');
  });
});

describe('match overflow menu', () => {
  async function openMenu() {
    const user = userEvent.setup();
    await openMenuFromKeyboard(user, 'Match options');
    return { user, menu: await screen.findByRole('menu') };
  }

  it('offers a few understandable tasks, not a settings drawer', async () => {
    app = await startApp();
    const { menu } = await openMenu();
    const items = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(items).toEqual(['Match Setup…', 'Correct Score…', 'Swap Sides', 'Reset Match…']);
    expect(within(menu).queryByRole('menuitemradio')).toBeNull();
  });

  it('swaps sides straight from the menu', async () => {
    app = await startApp();
    const { user, menu } = await openMenu();
    const before = score().home.name;
    await user.click(within(menu).getByRole('menuitem', { name: 'Swap Sides' }));
    expect(score().away.name).toBe(before);
  });

  it('changes format and team details together in Match Setup', async () => {
    app = await startApp();
    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole('menuitem', { name: /Match Setup/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Match setup' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Best of 3/ }));
    expect(within(dialog).getByRole('button', { name: /Best of 3/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const left = within(dialog).getByRole('textbox', { name: 'Left team' });
    fireEvent.change(left, { target: { value: 'Lions' } });
    // Nothing is applied until Apply.
    expect(score().matchFormat).toBe('best-of-5');
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(score()).toMatchObject({ matchFormat: 'best-of-3' });
    expect(score().home.name).toBe('Lions');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('cancels Match Setup without touching the score', async () => {
    app = await startApp();
    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole('menuitem', { name: /Match Setup/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Match setup' });
    await user.click(within(dialog).getByRole('button', { name: /Best of 3/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(score().matchFormat).toBe('best-of-5');
  });

  it('corrects the serve from the Correct Score dialog', async () => {
    const show = getState().doc.show.data;
    expect(show).toBeDefined();
    app = await startApp();
    const user = userEvent.setup();
    fireEvent.keyDown(document.body, { key: 'q' });
    expect(score().serving).toBe('home');
    await openMenuFromKeyboard(user, 'Match options');
    await user.click(await screen.findByRole('menuitem', { name: /Correct Score/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Correct score' });
    await user.click(within(dialog).getByRole('button', { name: 'Nobody' }));
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(score().serving).toBeNull();
  });
});

describe('media workspace inspector', () => {
  it('shows the rotation settings until an item is selected', async () => {
    app = await startApp();
    act(() => setState({ mode: 'media', selectedMediaIds: [] }));
    const inspector = await screen.findByRole('complementary', { name: 'Media inspector' });
    expect(within(inspector).getByText('Rotation')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(inspector).getByRole('button', { name: 'Cut' }));
    expect(mediaSet().transition).toBe('none');
    await user.click(within(inspector).getByRole('button', { name: 'Fill' }));
    expect(mediaSet().imageSizing).toBe('fill');

    act(() => setState({ selectedMediaIds: ['m1'] }));
    await waitFor(() => expect(within(inspector).queryByText('Rotation')).toBeNull());
    expect(within(inspector).getByText('one.png')).toBeInTheDocument();
  });

  it('keeps the header to the rotation, Add Media and one overflow menu', async () => {
    app = await startApp();
    act(() => setState({ mode: 'media' }));
    const header = (await screen.findAllByRole('banner')).find((element) =>
      element.textContent?.includes('Sponsors'),
    )!;
    const buttons = within(header)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(buttons).toEqual(['Sponsorsstored in show', 'Add Media', 'Rotation options']);
  });

  it('returns to the rotation settings from the overflow menu', async () => {
    app = await startApp();
    act(() => setState({ mode: 'media', selectedMediaIds: ['m2'] }));
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Rotation options' });
    await openMenuFromKeyboard(user, 'Rotation options');
    await user.click(await screen.findByRole('menuitem', { name: 'Rotation Settings' }));
    expect(getState().selectedMediaIds).toEqual([]);
  });
});

describe('roster inspector', () => {
  it('shows team properties until a player is selected', async () => {
    app = await startApp();
    act(() => setState({ mode: 'roster', selectedPlayerId: null }));
    const inspector = await screen.findByRole('complementary', { name: 'Player' });
    expect(within(inspector).getByText('Colours')).toBeInTheDocument();
    expect(
      within(inspector).getByRole('button', { name: 'Primary team colour' }),
    ).toBeInTheDocument();
    act(() => setState({ selectedPlayerId: 'p2' }));
    await waitFor(() => expect(within(inspector).queryByText('Colours')).toBeNull());
    expect(within(inspector).getByText('Presentation media')).toBeInTheDocument();
  });

  it('keeps team file actions in one overflow menu next to Paste Roster', async () => {
    app = await startApp();
    act(() => setState({ mode: 'roster' }));
    const user = userEvent.setup();
    expect(await screen.findByRole('button', { name: /Paste Roster/ })).toBeInTheDocument();
    await openMenuFromKeyboard(user, 'Team file');
    const menu = await screen.findByRole('menu');
    const items = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(items).toEqual([
      'New Team…',
      'Open Team…',
      'Save as Team File…',
      'Reveal Team File',
      'Locate Missing Photos & Videos…',
    ]);
  });

  it('edits a group limit as a property and deletes it from its own section', async () => {
    app = await startApp();
    act(() => setState({ mode: 'roster', selectedGroupId: 'on-court' }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /Groups/ }));
    const inspector = await screen.findByRole('complementary', { name: 'Group' });
    const limit = within(inspector).getByRole('spinbutton', { name: 'Maximum players' });
    // In jsdom every element sits at 0,0, so a synthetic click would land on the
    // panel separator; drive the field directly.
    limit.focus();
    fireEvent.change(limit, { target: { value: '8' } });
    await user.keyboard('{Enter}');
    const group = () =>
      getState().doc.show.data.team!.data!.groups.find((item) => item.id === 'on-court')!;
    expect(group().maxPlayers).toBe(8);
    // The header carries identity and the routine action, never a trash icon.
    const members = screen.getByRole('list', { name: 'On Court order' });
    expect(members).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete group' })).toBeNull();
    await user.click(within(inspector).getByRole('button', { name: 'Delete Group' }));
    expect(getState().doc.show.data.team!.data!.groups.map((item) => item.id)).not.toContain(
      'on-court',
    );
  });
});

describe('popovers', () => {
  it('moves focus into the display picker and returns it on Escape', async () => {
    app = await startApp();
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: /Output display/ });
    await user.click(trigger);
    const popover = await screen.findByRole('dialog', { name: 'Audience display' });
    await waitFor(() => expect(popover.contains(document.activeElement)).toBe(true));
    // The selected display is the first thing the keyboard lands on.
    expect(document.activeElement).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps global shortcuts quiet while a popover is open', async () => {
    app = await startApp();
    await goLiveFromUi();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Output display/ }));
    await screen.findByRole('dialog', { name: 'Audience display' });
    const before = app.platform.output.callsTo('next').length;
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(app.platform.output.callsTo('next')).toHaveLength(before);
  });

  it('does not let Space re-flip a checkbox that was just clicked', async () => {
    app = await startApp();
    await goLiveFromUi();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Lineup/ }));
    const popover = await screen.findByRole('dialog', { name: /lineup/i });
    const row = within(popover).getByText('Dot').closest('label')!;
    await user.click(row);
    // Close with a click elsewhere, then Space must advance media.
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /lineup/i })).toBeNull());
    (document.activeElement as HTMLElement | null)?.blur();
    const next = app.platform.output.callsTo('next').length;
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(app.platform.output.callsTo('next')).toHaveLength(next + 1);
  });
});

describe('forms', () => {
  it('does not submit the New team form when a Select inside it is opened', async () => {
    app = await startApp();
    act(() => setState({ mode: 'roster' }));
    const user = userEvent.setup();
    await openMenuFromKeyboard(user, 'Team file');
    await user.click(await screen.findByRole('menuitem', { name: 'New Team…' }));
    const dialog = await screen.findByRole('dialog', { name: 'New team' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Sport' }));
    await screen.findByRole('listbox');
    // Opening the Select is not a submit: no validation message appeared.
    expect(within(dialog).queryByText('Enter a team name.')).toBeNull();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Team name' }), {
      target: { value: 'Falcons' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Create Team' }));
    await waitFor(() => expect(getState().doc.show.data.team?.data?.name).toBe('Falcons'));
  });
});

describe('dialogs', () => {
  it('focuses the safe answer of a destructive question and cancels on Escape', async () => {
    app = await startApp();
    await goLiveFromUi();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(getState().output.phase).toBe('live');
  });

  it('makes the rest of the app inert while a dialog is open', async () => {
    app = await startApp();
    act(() => setState({ shortcutsOpen: true }));
    await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    await waitFor(() =>
      expect(document.querySelector('.app-container')).toHaveProperty('inert', true),
    );
  });
});
