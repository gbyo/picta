/**
 * Startup and native event wiring.
 *
 * Runs once, outside React. Returns a disposer that removes every listener,
 * timer and subscription it created, so hot reloads and tests never leave a
 * second handler behind.
 */

import { isSupportedMediaPath } from '@core/media.js';
import { shouldCheckNow, shouldNotify } from '@core/update.js';
import type { OutputHandlers } from '@app/output-controller.js';
import { installRuntime, rt } from './runtime.js';
import type { FileDragEvent, Platform, Unlisten } from './platform/types.js';
import { getState, setState, store } from './state/store.js';
import { anyDialogOpen } from './state/dialogs.js';
import {
  adoptRememberedDisplay,
  goLive,
  handleOutputStopped,
  identifyDisplays,
  refreshDisplays,
  requestStopOutput,
  updateControllerDisplay,
  nextMedia,
  previousMedia,
} from './actions/output.js';
import {
  newShow,
  offerRecovery,
  openMediaSet,
  openShow,
  openTeam,
  requestQuit,
  saveMedia,
  saveShow,
  saveTeam,
} from './actions/document.js';
import { addMediaPaths } from './actions/media.js';
import { endCue } from './actions/cues.js';
import { setMode, openPalette } from './actions/ui.js';
import { notify } from './actions/notify.js';
import { startSync, windowTitle } from './actions/sync.js';

export function outputHandlers(): OutputHandlers {
  return {
    onPosition: (position, total, item) =>
      setState((state) => ({
        output: {
          ...state.output,
          media: { itemId: item?.id ?? null, position, total, since: Date.now() },
        },
      })),
    onStage: (stage) =>
      setState((state) =>
        state.output.phase === 'preparing' ? { output: { ...state.output, stage } } : {},
      ),
    onStopped: (reason) => void handleOutputStopped(reason),
    onCueState: (cueState) =>
      setState((state) => {
        const previous = state.output.cue;
        const changed =
          previous.state.current !== cueState.current || previous.state.index !== cueState.index;
        let context = null;
        try {
          context = rt().output.cueContext;
        } catch {
          context = null;
        }
        return {
          output: {
            ...state.output,
            cue: { state: cueState, context, since: changed ? Date.now() : previous.since },
          },
        };
      }),
    onWarning: (message) => notify.warning(message),
  };
}

export async function checkForUpdates(force = false): Promise<void> {
  const { platform } = rt();
  const state = getState();
  if (
    !force &&
    !shouldCheckNow(
      {
        enabled: state.prefs.updateChecks,
        lastCheck: state.prefs.lastUpdateCheck,
        dismissedVersion: state.prefs.dismissedVersion,
      },
      Date.now(),
      { running: state.output.phase !== 'off' },
    )
  )
    return;
  const status = await platform.updates.check();
  const prefs = { ...getState().prefs, lastUpdateCheck: Date.now() };
  platform.prefs.write(prefs);
  setState({ prefs });
  if (!status) {
    if (force) notify.warning('Could not check for updates. Picta works fine offline.');
    return;
  }
  if (shouldNotify(status, force ? null : prefs.dismissedVersion)) setState({ update: status });
  else if (force) notify.info(`Picta ${status.currentVersion} is up to date.`);
}

export function dismissUpdate(): void {
  const { platform } = rt();
  const update = getState().update;
  if (update?.latestVersion) {
    const prefs = { ...getState().prefs, dismissedVersion: update.latestVersion };
    platform.prefs.write(prefs);
    setState({ prefs });
  }
  setState({ update: null });
}

function setUpdateChecks(enabled: boolean): void {
  const prefs = { ...getState().prefs, updateChecks: enabled };
  rt().platform.prefs.write(prefs);
  setState({ prefs });
}

export function handleMenu(id: string): void {
  switch (id) {
    case 'new':
      void newShow();
      return;
    case 'open':
      void openShow();
      return;
    case 'save':
      void saveShow();
      return;
    case 'save-as':
      void saveShow(true);
      return;
    case 'save-media':
      void saveMedia();
      return;
    case 'save-team':
      void saveTeam();
      return;
    case 'check-updates':
      void checkForUpdates(true);
      return;
    case 'update-checks-on':
      setUpdateChecks(true);
      return;
    case 'update-checks-off':
      setUpdateChecks(false);
      return;
    case 'view-console':
      setMode('console');
      return;
    case 'view-media':
      setMode('media');
      return;
    case 'view-roster':
      setMode('roster');
      return;
    case 'view-screens':
      setMode('screens');
      return;
    case 'command-palette':
      openPalette();
      return;
    case 'go-live':
      void goLive();
      return;
    case 'stop-output':
      void requestStopOutput();
      return;
    case 'identify-displays':
      void identifyDisplays();
      return;
  }
}

/** Keys forwarded from the presentation window, should it ever have focus. */
export function handlePresentationKey(key: string): void {
  if (getState().output.phase !== 'live' || anyDialogOpen()) return;
  if (key === 'Escape') {
    if (rt().output.cueActive) endCue();
  } else if (key === 'ArrowLeft') previousMedia();
  else if (key === 'ArrowRight' || key === ' ') nextMedia();
}

/** What dropping these files would do, in words, or null when nothing applies. */
export function describeDrop(paths: readonly string[]): string | null {
  if (paths.some((path) => /\.picta$/i.test(path))) return 'Open this show';
  if (paths.some((path) => /\.pictaset$/i.test(path))) return 'Use this media set';
  if (paths.some((path) => /\.pictateam$/i.test(path))) return 'Open this team';
  const media = paths.filter(isSupportedMediaPath).length;
  if (media === 0) return null;
  if (getState().output.phase !== 'off') return 'The rotation is locked while ON AIR';
  return `Add ${media} file${media === 1 ? '' : 's'} to the media rotation`;
}

export function handleFileDrag(event: FileDragEvent): void {
  if (event.type === 'enter') {
    setState({ fileDrag: { paths: event.paths } });
    return;
  }
  if (event.type === 'over') return;
  setState({ fileDrag: null });
  if (event.type !== 'drop') return;
  const paths = event.paths;
  const show = paths.find((path) => /\.picta$/i.test(path));
  const set = paths.find((path) => /\.pictaset$/i.test(path));
  const team = paths.find((path) => /\.pictateam$/i.test(path));
  if (show) void openShow(show);
  else if (set) {
    setMode('media');
    void openMediaSet(set);
  } else if (team) {
    setMode('roster');
    void openTeam(team);
  } else if (paths.some(isSupportedMediaPath)) {
    if (getState().mode !== 'media') setMode('media');
    void addMediaPaths(paths);
  } else if (paths.length > 0) notify.warning('Picta plays PNG, JPEG, WebP, MP4 and WebM files.');
}

export interface BootOptions {
  /** Ask about crash recovery and open a startup file. Off in some tests. */
  restoreSession?: boolean;
  /** Poll the display topology. */
  watchDisplays?: boolean;
  checkUpdates?: boolean;
}

/** Install the runtime for a platform. Call once before rendering. */
export function install(platform: Platform): void {
  installRuntime(platform, outputHandlers());
}

export async function boot(options: BootOptions = {}): Promise<() => void> {
  const { restoreSession = true, watchDisplays = true, checkUpdates = true } = options;
  const { platform, output } = rt();
  const unlisteners: Unlisten[] = [];
  let disposed = false;
  let watch: ReturnType<typeof setInterval> | null = null;

  const stopSync = startSync();
  const pathStyle = await platform.pathStyle();
  const prefs = await platform.prefs.read();
  setState({ native: platform.native, pathStyle, prefs });
  await output.init();

  const displays = await platform.displays.list().catch(() => []);
  setState({ displays });
  adoptRememberedDisplay();
  if (prefs.window) await platform.window.restoreGeometry(prefs.window, displays);

  const listen = async (subscribe: Promise<Unlisten>) => {
    try {
      const off = await subscribe;
      if (disposed) off();
      else unlisteners.push(off);
    } catch {
      // A missing native capability must never stop the controller starting.
    }
  };
  await Promise.all([
    listen(platform.events.onMenu(handleMenu)),
    listen(platform.events.onPresentationKey(handlePresentationKey)),
    listen(platform.events.onFileDrag(handleFileDrag)),
    listen(platform.events.onCloseRequested(requestQuit)),
  ]);

  setState({ booted: true });
  void platform.window.setTitle(windowTitle(getState())).catch(() => undefined);
  await platform.window.reveal().catch(() => undefined);
  await updateControllerDisplay();

  let recovered = false;
  if (restoreSession) {
    recovered = await offerRecovery().catch(() => false);
    const startup = await platform.files.startupFile().catch(() => null);
    if (startup && !recovered) await openShow(startup);
  }

  const schedule = () => {
    if (watch !== null) clearInterval(watch);
    if (!watchDisplays || disposed) return;
    watch = setInterval(
      () => void refreshDisplays(),
      getState().output.phase === 'live' ? 1500 : 5000,
    );
  };
  schedule();
  let lastPhase = getState().output.phase;
  const offPhase = store.subscribe((state) => {
    if (state.output.phase === lastPhase) return;
    lastPhase = state.output.phase;
    schedule();
  });

  if (checkUpdates) void checkForUpdates().catch(() => undefined);

  return () => {
    disposed = true;
    if (watch !== null) clearInterval(watch);
    offPhase();
    stopSync();
    for (const off of unlisteners) off();
    void output.dispose();
  };
}
