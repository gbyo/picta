/**
 * Taking the audience display live, keeping it live, and stopping it.
 *
 * Go Live is staged and honest: the presentation window is prepared hidden,
 * the renderer must answer, the Screen must mount and the first media must
 * load before the window is revealed. Any failure closes the hidden window and
 * leaves Picta OFF AIR with a reason the operator can act on.
 */

import type { MediaSet } from '@core/domain.js';
import { findById, hintFor, matchDisplay, topologyEquals } from '@core/monitors.js';
import { basename } from '@core/paths.js';
import type { OutputStopReason } from '@app/output-controller.js';
import { rt } from '../runtime.js';
import { ask } from '../state/dialogs.js';
import {
  armedScreen,
  boardDataFor,
  mediaPanel,
  outputThemeFor,
  programScreen,
  screenById,
  scoreOf,
} from '../state/derive.js';
import {
  getState,
  initialOutputState,
  setState,
  type OutputFailure,
  type PrepareStage,
} from '../state/store.js';
import { currentMediaSet } from './edit.js';
import { notify } from './notify.js';
import { markScreenApplied } from './sync.js';

function setStage(stage: PrepareStage): void {
  setState((state) => ({ output: { ...state.output, stage } }));
}

function fail(title: string, detail: string): void {
  const failure: OutputFailure = { title, detail, at: Date.now() };
  setState((state) => ({
    output: { ...initialOutputState(), failure, media: state.output.media },
    manual: null,
  }));
  notify.error(title, detail);
}

function clearFailure(): void {
  setState((state) => ({ output: { ...state.output, failure: null } }));
}

export function dismissFailure(): void {
  clearFailure();
}

const BEGIN_FAILURES: Record<string, { title: string; detail: string }> = {
  'presentation-not-ready': {
    title: 'The output window did not start',
    detail: 'The renderer never answered. Nothing was shown. Try Go Live again.',
  },
  'presentation-unavailable': {
    title: 'The output window did not start',
    detail: 'The presentation window became unavailable while starting. Nothing was shown.',
  },
  'screen-not-ready': {
    title: 'The Screen did not finish loading',
    detail: 'Its panels never reported ready, so nothing was shown.',
  },
  'initial-content-not-ready': {
    title: 'The first media item did not load',
    detail: 'Nothing was shown. Check the media rotation, then try again.',
  },
  'no-usable-media': {
    title: 'No media could be played',
    detail: 'Every item was missing or failed its check. Nothing was shown.',
  },
};

export async function refreshPreflight(): Promise<void> {
  const { platform } = rt();
  const revision = getState().preflight.revision;
  setState((state) => ({ preflight: { ...state.preflight, running: true } }));
  const set = currentMediaSet();
  try {
    const result = await platform.preflight.check(set.items);
    if (getState().preflight.revision !== revision) return;
    setState((state) => ({ preflight: { ...state.preflight, result, running: false } }));
  } catch {
    setState((state) => ({ preflight: { ...state.preflight, running: false } }));
  }
}

/** Media edits invalidate any earlier capability check. */
export function invalidatePreflight(paths?: readonly string[]): void {
  try {
    rt().platform.preflight.invalidate(paths);
  } catch {
    // No runtime yet (early startup); nothing is cached.
  }
  setState((state) => ({
    preflight: { result: null, running: false, revision: state.preflight.revision + 1 },
  }));
}

/**
 * Each Go Live attempt has a token. Stop, New, Open or Quit can end an attempt
 * while it is still awaiting the renderer; a stale attempt must clean up after
 * itself and never mark the output live.
 */
let attempt = 0;

export async function goLive(): Promise<boolean> {
  const state = getState();
  if (state.output.phase !== 'off') return false;
  const { platform, output } = rt();
  const token = ++attempt;
  const stale = () => token !== attempt || getState().output.phase !== 'preparing';
  const displayId = state.selectedDisplayId;
  if (!displayId) {
    fail('Choose a display first', 'Pick the audience display from the display menu.');
    return false;
  }
  let screen = armedScreen(state);
  setState({
    output: { ...initialOutputState(), phase: 'preparing', stage: 'checking-display' },
  });
  let opened = false;
  try {
    const displays = await platform.displays.list().catch(() => getState().displays);
    if (stale()) return false;
    if (!topologyEquals(displays, getState().displays)) setState({ displays });
    const display = findById(displays, displayId);
    if (!display) {
      fail('That display is no longer connected', 'Choose another display and try again.');
      return false;
    }

    setStage('checking-media');
    const set = currentMediaSet();
    let preflight = getState().preflight.result;
    if (!preflight || preflight.total !== set.items.length) {
      await refreshPreflight();
      if (stale()) return false;
      preflight = getState().preflight.result;
    }
    const failedIds = new Set(preflight?.failed.map((failure) => failure.id) ?? []);
    const outputSet: MediaSet = {
      ...set,
      // A failed item is skipped for this run but stays in the rotation with
      // its diagnostic, so the operator can repair it later.
      items: set.items.map((item) => (failedIds.has(item.id) ? { ...item, missing: true } : item)),
    };

    setStage('opening-window');
    output.resetReady();
    const placed = await platform.presentation.prepare(display.id);
    opened = true;
    if (stale()) {
      await platform.presentation.close().catch(() => undefined);
      return false;
    }
    const prefs = { ...getState().prefs, displayHint: hintFor(placed) };
    platform.prefs.write(prefs);
    setState({ prefs, lostDisplayHint: null });

    // The operator may have switched Screens while the window was opening.
    screen = armedScreen(getState());
    const data = getState().doc.show.data;
    output.setTheme(outputThemeFor(data, screen));
    markScreenApplied(screen, data);
    const started = await output.begin(
      outputSet,
      {
        intervalSeconds: outputSet.imageDurationSeconds,
        transition: outputSet.transition,
        imageSizing: outputSet.imageSizing,
        layout: { type: 'zone', id: 'legacy', role: 'program' },
        screen,
      },
      boardDataFor(data, screen),
      scoreOf(data),
    );
    if (stale()) {
      // Whatever ended this attempt already reset the UI; make sure nothing
      // keeps running behind it.
      if (started) output.abandon();
      await platform.presentation.close().catch(() => undefined);
      return false;
    }
    if (!started) {
      await platform.presentation.close().catch(() => undefined);
      const reason = BEGIN_FAILURES[output.lastBeginFailure ?? 'presentation-unavailable']!;
      fail(reason.title, reason.detail);
      return false;
    }

    setStage('revealing');
    await platform.presentation.show(display.id);
    if (stale()) {
      output.abandon();
      await platform.presentation.close().catch(() => undefined);
      return false;
    }
    // Live from the Screen the operator has armed now; sync pushes anything
    // that changed since begin() was called.
    const liveScreen = armedScreen(getState());
    const skipped = set.items.filter((item) => failedIds.has(item.id) || item.missing);
    setState((s) => ({
      output: {
        ...s.output,
        phase: 'live',
        stage: null,
        liveScreenId: liveScreen.id,
        startedAt: Date.now(),
        failure: null,
        skippedItemIds: skipped.map((item) => item.id),
      },
      armedScreenId: liveScreen.id,
    }));
    notify.info(`ON AIR · ${liveScreen.name} on Display ${display.index}`);
    if (skipped.length > 0)
      notify.warning(
        `${skipped.length} media item${skipped.length === 1 ? '' : 's'} will be skipped: ${skipped
          .slice(0, 3)
          .map((item) => basename(item.path, getState().pathStyle))
          .join(', ')}${skipped.length > 3 ? '…' : ''}`,
      );
    return true;
  } catch (error) {
    if (token !== attempt) return false;
    if (opened) {
      output.abandon();
      await platform.presentation.close().catch(() => undefined);
    }
    fail('Output could not start', String(error));
    return false;
  }
}

/** Ask, then stop. Stopping blanks the audience display immediately. */
export async function requestStopOutput(): Promise<void> {
  const state = getState();
  if (state.output.phase !== 'live') return;
  const screen = programScreen(state);
  const confirmed = await ask.confirm({
    title: 'Stop output?',
    body: `The audience display goes black and closes immediately. ${screen.name} is on air now.`,
    confirmLabel: 'Stop Output',
    tone: 'danger',
  });
  if (confirmed) await stopOutput();
}

export async function stopOutput(): Promise<void> {
  const state = getState();
  if (state.output.phase === 'off') return;
  const { platform, output } = rt();
  attempt += 1;
  const liveScreenId = state.output.liveScreenId;
  const docBefore = state.doc;
  setState((s) => ({ output: { ...s.output, phase: 'stopping' } }));
  output.stop('user', false);
  await platform.presentation.close().catch(() => undefined);
  setState((s) => ({
    output: { ...initialOutputState(), media: s.output.media },
    manual: null,
    // Keep the Screen that was on air armed, unless another show replaced
    // this one while the window was closing.
    armedScreenId: s.doc === docBefore ? (liveScreenId ?? s.armedScreenId) : s.armedScreenId,
  }));
  notify.info('OFF AIR · output stopped');
}

/** The output controller stopped on its own. Never leave a black window behind. */
export async function handleOutputStopped(reason: OutputStopReason): Promise<void> {
  if (reason === 'user') return;
  const { platform } = rt();
  const state = getState();
  // During preparing, Go Live reports its own failure and closes the window.
  if (state.output.phase !== 'live') return;
  await platform.presentation.close().catch(() => undefined);
  if (reason === 'display-lost') {
    setState({ lostDisplayHint: state.prefs.displayHint });
    fail(
      'The output display disconnected',
      'Output stopped. Reconnect the display and choose it again to resume.',
    );
  } else {
    fail('Output stopped: nothing could play', 'Every remaining media item failed to load.');
  }
}

/** Switch the live Screen (or arm one while off air). Runtime only: never dirties the show. */
export function selectScreen(screenId: string): void {
  const state = getState();
  const screen = screenById(state.doc.show.data, screenId);
  if (!screen) return;
  if (state.output.phase === 'live') {
    if (state.output.liveScreenId === screenId) return;
    // A manual lineup's in-flight player is cancelled by the output when its
    // panel goes away; keep the session itself.
    setState((s) => ({ output: { ...s.output, liveScreenId: screenId }, armedScreenId: screenId }));
    if (!mediaPanel(screen) && state.output.media.total > 0)
      notify.info(`${screen.name} has no media panel. The rotation is paused.`);
    return;
  }
  setState({ armedScreenId: screenId });
}

export function nextMedia(): void {
  if (getState().output.phase !== 'live') return;
  rt().output.next();
}

export function previousMedia(): void {
  if (getState().output.phase !== 'live') return;
  rt().output.previous();
}

export function jumpToMedia(itemId: string): void {
  if (getState().output.phase !== 'live') return;
  rt().output.jumpTo(itemId);
}

// ---------------------------------------------------------------------------
// Displays
// ---------------------------------------------------------------------------

export async function refreshDisplays(): Promise<void> {
  const { platform, output } = rt();
  let next;
  try {
    next = await platform.displays.list();
  } catch {
    return;
  }
  const state = getState();
  if (!topologyEquals(next, state.displays)) setState({ displays: next });
  await updateControllerDisplay();

  if (state.output.phase === 'live') {
    if (!state.selectedDisplayId || !findById(next, state.selectedDisplayId)) {
      setState({ lostDisplayHint: state.prefs.displayHint });
      output.abandon();
      await platform.presentation.close().catch(() => undefined);
      setState({ selectedDisplayId: null });
      fail(
        'The output display disconnected',
        'Output stopped. Reconnect the display and choose it again to resume.',
      );
    }
    return;
  }
  if (state.selectedDisplayId && !findById(next, state.selectedDisplayId))
    setState({ selectedDisplayId: null });
  const lost = getState().lostDisplayHint;
  if (lost && !getState().selectedDisplayId) {
    const match = matchDisplay(lost, next);
    if (match.confidence === 'exact' && match.display) {
      setState({ selectedDisplayId: match.display.id, lostDisplayHint: null });
      notify.success(`Display ${match.display.index} is back. Go Live when ready.`);
    }
  }
}

/** Choose the remembered display when it can be identified without guessing. */
export function adoptRememberedDisplay(): void {
  const state = getState();
  if (state.selectedDisplayId && findById(state.displays, state.selectedDisplayId)) return;
  const match = matchDisplay(state.prefs.displayHint, state.displays);
  setState({
    selectedDisplayId: match.confidence === 'exact' && match.display ? match.display.id : null,
    displayAmbiguous: match.confidence === 'ambiguous',
  });
}

export function chooseDisplay(displayId: string): void {
  const state = getState();
  if (state.output.phase !== 'off') return;
  const display = findById(state.displays, displayId);
  if (!display) return;
  const prefs = { ...state.prefs, displayHint: hintFor(display) };
  rt().platform.prefs.write(prefs);
  setState({
    selectedDisplayId: display.id,
    prefs,
    displayAmbiguous: false,
    lostDisplayHint: null,
  });
  clearFailure();
}

export async function identifyDisplays(): Promise<void> {
  try {
    await rt().platform.displays.identify();
  } catch (error) {
    notify.error('Could not identify displays', String(error));
  }
}

/** Work out which display the controller window is on, to warn about covering it. */
export async function updateControllerDisplay(): Promise<void> {
  const geometry = await rt()
    .platform.window.geometry()
    .catch(() => null);
  if (!geometry) return;
  const centerX = geometry.x + geometry.width / 2;
  const centerY = geometry.y + geometry.height / 2;
  const display = getState().displays.find(
    (item) =>
      centerX >= item.x &&
      centerX < item.x + item.width &&
      centerY >= item.y &&
      centerY < item.y + item.height,
  );
  const id = display?.id ?? null;
  if (id !== getState().controllerDisplayId) setState({ controllerDisplayId: id });
}
