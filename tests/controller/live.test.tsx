// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getState } from '../../src/controller/state/store.js';
import { goLiveFromUi, sampleShow, startApp, type Started } from './harness.js';

let app: Started | null = null;
afterEach(() => {
  app?.dispose();
  app = null;
});

function score() {
  return getState().doc.show.data.event.score!;
}

describe('Screen switching', () => {
  it('arms a Screen off air without touching the document', async () => {
    app = await startApp();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Full Score/ }));
    expect(getState().armedScreenId).toBe('full-score');
    expect(getState().doc.show.dirty).toBe(false);
    expect(app.platform.output.callsTo('applyScreen')).toHaveLength(0);
  });

  it('switches the live display with one click and never dirties the show', async () => {
    app = await startApp();
    await goLiveFromUi();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Media \+ Stats/ }));
    const applied = app.platform.output.callsTo('applyScreen');
    expect(applied).toHaveLength(1);
    expect((applied[0]!.args[0] as { id: string }).id).toBe('media-stats');
    expect(getState().output.liveScreenId).toBe('media-stats');
    expect(getState().doc.show.dirty).toBe(false);
  });

  it('switches with number keys, but not while typing', async () => {
    app = await startApp();
    await goLiveFromUi();
    fireEvent.keyDown(window, { key: '4' });
    expect(getState().output.liveScreenId).toBe('full-score');
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    fireEvent.keyDown(input, { key: '3' });
    expect(getState().output.liveScreenId).toBe('full-score');
    input.remove();
  });
});

describe('media transport', () => {
  it('drives the rotation from buttons, arrows and Space', async () => {
    app = await startApp();
    await goLiveFromUi();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next media' }));
    await user.click(screen.getByRole('button', { name: 'Previous media' }));
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(app.platform.output.callsTo('next')).toHaveLength(3);
    expect(app.platform.output.callsTo('previous')).toHaveLength(2);
  });

  it('lets a focused button keep Space, and ignores keys in text fields', async () => {
    app = await startApp();
    await goLiveFromUi();
    const button = screen.getByRole('button', { name: 'Stop' });
    fireEvent.keyDown(button, { key: ' ' });
    await userEvent.setup().click(screen.getByRole('tab', { name: /Cues/ }));
    const input = screen.getByRole('textbox', { name: /Find a player/ });
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(app.platform.output.callsTo('next')).toHaveLength(0);
  });

  it('does nothing while off air', async () => {
    app = await startApp();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(app.platform.output.callsTo('next')).toHaveLength(0);
  });

  it('forwards keys pressed on the presentation window', async () => {
    app = await startApp();
    await goLiveFromUi();
    act(() => app!.platform.emitPresentationKey('ArrowRight'));
    expect(app.platform.output.callsTo('next')).toHaveLength(1);
  });

  it('shows the item on air and what comes next', async () => {
    app = await startApp();
    await goLiveFromUi();
    const transport = screen.getByRole('region', { name: 'Media transport' });
    expect(within(transport).getByText('one.png', { selector: 'p' })).toBeInTheDocument();
    expect(within(transport).getByText('Next: two.png')).toBeInTheDocument();
  });

  it('pauses the rotation honestly on a Screen without a media panel', async () => {
    app = await startApp();
    await goLiveFromUi();
    fireEvent.keyDown(document.body, { key: '4' });
    const transport = await screen.findByRole('region', { name: 'Media transport' });
    expect(within(transport).getByText(/Full Score has no media panel/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next media' })).toBeDisabled();
  });
});

describe('volleyball score', () => {
  it('scores a rally, gives the serve, and pushes it to the live display', async () => {
    app = await startApp();
    await goLiveFromUi();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Point Opponent' }));
    expect(score().awayPoints).toBe(1);
    expect(score().serving).toBe('away');
    expect(app.platform.output.callsTo('setScore').at(-1)!.args[0]).toMatchObject({
      awayPoints: 1,
    });
    expect(getState().doc.show.dirty).toBe(true);
  });

  it('undoes exactly what it says it will undo', async () => {
    app = await startApp();
    const user = userEvent.setup();
    fireEvent.keyDown(document.body, { key: 'q' });
    fireEvent.keyDown(document.body, { key: 'q' });
    expect(score().homePoints).toBe(2);
    expect(screen.getByRole('button', { name: /Undo · Wildcats \+1 \(2–0\)/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Undo · Wildcats/ }));
    expect(score().homePoints).toBe(1);
    fireEvent.keyDown(document.body, { key: 'z' });
    expect(score().homePoints).toBe(0);
    expect(score().serving).toBeNull();
  });

  it('ends a regulation set immediately and offers Undo', async () => {
    const show = sampleShow();
    show.event.score = { ...show.event.score!, homePoints: 25, awayPoints: 23 };
    app = await startApp({ show });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'End set 1' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(score()).toMatchObject({ homeSets: 1, homePoints: 0, awayPoints: 0, setNumber: 2 });
  });

  it('warns and confirms before an unusual set finish', async () => {
    const show = sampleShow();
    show.event.score = { ...show.event.score!, homePoints: 12, awayPoints: 9 };
    app = await startApp({ show });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'End set 1' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('not a standard finish');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(score().homeSets).toBe(0);
    await user.click(screen.getByRole('button', { name: 'End set 1' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /End Set/ }),
    );
    expect(score().homeSets).toBe(1);
  });

  it('keeps the final score visible and stops accepting points when the match is won', async () => {
    const show = sampleShow();
    show.event.score = {
      ...show.event.score!,
      homeSets: 2,
      homePoints: 25,
      awayPoints: 20,
      setNumber: 3,
    };
    app = await startApp({ show });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'End set 3' }));
    expect(score()).toMatchObject({ homeSets: 3, homePoints: 25, awayPoints: 20, setNumber: 3 });
    expect(screen.getByText(/Final · Wildcats wins 3–0/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Point Wildcats' })).toBeDisabled();
    fireEvent.keyDown(document.body, { key: 'q' });
    expect(score().homePoints).toBe(25);
  });

  it('asks before resetting the match', async () => {
    const show = sampleShow();
    show.event.score = { ...show.event.score!, homeSets: 1, homePoints: 4 };
    app = await startApp({ show });
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Match options' }).focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('menuitem', { name: /Reset Match/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reset Score' }),
    );
    expect(score()).toMatchObject({ homeSets: 0, homePoints: 0, setNumber: 1 });
  });
});

describe('live statistics', () => {
  it('records a stat with its compound counter and undoes it', async () => {
    app = await startApp();
    const user = userEvent.setup();
    const tile = screen.getByRole('article', { name: '#2 Bea' });
    await user.click(within(tile).getByRole('button', { name: /^Kills for #2 Bea/ }));
    expect(getState().doc.show.data.event.stats['p2']).toMatchObject({ kills: 1, attempts: 1 });
    await user.click(screen.getByRole('button', { name: /Undo · #2 Bea K \+1/ }));
    expect(getState().doc.show.data.event.stats['p2']).toMatchObject({ kills: 0, attempts: 0 });
  });

  it('updates the board on the live display', async () => {
    app = await startApp();
    await goLiveFromUi();
    const user = userEvent.setup();
    const tile = screen.getByRole('article', { name: '#1 Ada' });
    await user.click(within(tile).getByRole('button', { name: /^Digs for #1 Ada/ }));
    expect(app.platform.output.callsTo('setBoard')).toHaveLength(1);
  });
});

describe('cues', () => {
  it('presents a player card in the media panel and ends it with Escape', async () => {
    app = await startApp();
    await goLiveFromUi();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Cues/ }));
    await user.click(screen.getByRole('button', { name: 'Show card for #1 Ada' }));
    const played = app.platform.output.callsTo('playCues')[0]!;
    const [cues, context] = played.args as [{ type: string; target: string }[], { kind: string }];
    expect(cues[0]).toMatchObject({ type: 'player-card', target: 'program' });
    expect(context.kind).toBe('single-player');
    expect(await screen.findByRole('region', { name: 'Cue on air' })).toHaveTextContent('#1 Ada');
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(app.platform.output.callsTo('cancelCue')).toHaveLength(1);
    expect(getState().output.phase).toBe('live');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Cue on air' })).toBeNull());
  });

  it('covers the full display when the live Screen has no media panel', async () => {
    app = await startApp();
    await goLiveFromUi();
    fireEvent.keyDown(document.body, { key: '4' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Cues/ }));
    expect(screen.getByText(/full screen/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show card for #1 Ada' }));
    const [cues] = app.platform.output.callsTo('playCues')[0]!.args as [{ target: string }[]];
    expect(cues[0]!.target).toBe('full-board');
  });

  it('plays a lineup in order using each player’s preferred presentation', async () => {
    app = await startApp();
    await goLiveFromUi();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Cues/ }));
    const row = screen.getByText('Starting Lineup').closest('li')!;
    await user.click(within(row).getByRole('button', { name: /Play in order/ }));
    const [cues, context] = app.platform.output.callsTo('playCues')[0]!.args as [
      { type: string }[],
      { kind: string; label: string },
    ];
    expect(cues.map((cue) => cue.type)).toEqual(['player-card', 'video', 'player-card']);
    expect(context).toMatchObject({ kind: 'ordered-group', label: 'Starting Lineup' });
  });

  it('marks a manual lineup player shown only after the audience saw them', async () => {
    app = await startApp();
    await goLiveFromUi();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Cues/ }));
    const row = screen.getByText('Starting Lineup').closest('li')!;
    await user.click(within(row).getByRole('button', { name: /Manually/ }));
    await user.click(screen.getByRole('button', { name: /Ada/ }));
    expect(getState().manual?.shownPlayerIds).toEqual([]);
    await act(async () => app!.platform.output.completeCue(true));
    await waitFor(() => expect(getState().manual?.shownPlayerIds).toEqual(['p1']));
    expect(screen.getByText(/1 of 3 shown/)).toBeInTheDocument();
  });

  it('cannot present anything while off air', async () => {
    app = await startApp();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Cues/ }));
    expect(screen.getByRole('button', { name: 'Show card for #1 Ada' })).toBeDisabled();
    expect(screen.getByText(/Cues need a live output/)).toBeInTheDocument();
  });
});

describe('native integration', () => {
  it('switches workspaces from the native View menu', async () => {
    app = await startApp();
    act(() => app!.platform.emitMenu('view-screens'));
    expect(getState().mode).toBe('screens');
    act(() => app!.platform.emitMenu('view-console'));
    expect(getState().mode).toBe('console');
  });

  it('remembers the automatic update-check choice from the menu', async () => {
    app = await startApp();
    act(() => app!.platform.emitMenu('update-checks-off'));
    expect(getState().prefs.updateChecks).toBe(false);
    act(() => app!.platform.emitMenu('update-checks-on'));
    expect(getState().prefs.updateChecks).toBe(true);
  });

  it('ends a cue from the presentation window but never stops the output', async () => {
    app = await startApp();
    await goLiveFromUi();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Cues/ }));
    await user.click(screen.getByRole('button', { name: 'Show card for #1 Ada' }));
    act(() => app!.platform.emitPresentationKey('Escape'));
    expect(app.platform.output.callsTo('cancelCue')).toHaveLength(1);
    expect(app.platform.output.callsTo('stop')).toHaveLength(1); // only the stop inside begin()
    expect(getState().output.phase).toBe('live');
  });
});

describe('focus safety', () => {
  it('does not let Space re-press a stat button that was just clicked', async () => {
    app = await startApp();
    await goLiveFromUi();
    const user = userEvent.setup();
    const tile = screen.getByRole('article', { name: '#1 Ada' });
    await user.click(within(tile).getByRole('button', { name: /^Digs for #1 Ada/ }));
    await user.keyboard(' ');
    expect(getState().doc.show.data.event.stats['p1']).toMatchObject({ digs: 1 });
    expect(app.platform.output.callsTo('next')).toHaveLength(1);
  });
});
