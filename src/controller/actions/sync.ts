/**
 * Keeps the outside world in step with the store.
 *
 * Actions only change state. These subscriptions then push exactly what
 * changed to the live output (score, board, theme, Screen), keep the window
 * title honest about unsaved work, and write machine-local crash recovery.
 */

import type { Screen, ShowDocument } from '@core/domain.js';
import { rt } from '../runtime.js';
import {
  boardDataFor,
  outputThemeFor,
  scoreOf,
  screenById,
  showTitle,
  anyDirty,
} from '../state/derive.js';
import { store, type PictaState } from '../state/store.js';
import { createRecoverySnapshot } from '@app/recovery.js';

let appliedScreen: Screen | null = null;
/** The document Go Live handed to the output, to catch up on edits made while preparing. */
let beganWith: ShowDocument | null = null;

/** Go Live mounts its Screen itself; don't re-apply it the moment it goes live. */
export function markScreenApplied(screen: Screen | null, data: ShowDocument | null = null): void {
  appliedScreen = screen;
  beganWith = data;
}

function syncOutput(state: PictaState, previous: PictaState): void {
  if (state.output.phase !== 'live') {
    if (previous.output.phase === 'live') appliedScreen = null;
    return;
  }
  const { output } = rt();
  const data = state.doc.show.data;
  const before = previous.doc.show.data;
  const screen = screenById(data, state.output.liveScreenId);
  if (!screen) return;
  const wentLive = previous.output.phase !== 'live';
  // On the way live, compare with what begin() was given rather than with the
  // previous store state: the operator may have scored, edited or switched
  // Screens while the output was preparing.
  const baseline = wentLive && beganWith ? beganWith : before;
  if (wentLive) beganWith = null;

  if (screen !== appliedScreen) {
    appliedScreen = screen;
    output.applyScreen(screen, boardDataFor(data, screen), scoreOf(data));
    output.setTheme(outputThemeFor(data, screen));
    return;
  }
  if (wentLive && baseline === before) return;

  if (data.event.score !== baseline.event.score) output.setScore(scoreOf(data));
  const team = data.team?.data;
  const teamBefore = baseline.team?.data;
  if (
    data.event.stats !== baseline.event.stats ||
    data.event.liveGroups !== baseline.event.liveGroups ||
    team !== teamBefore
  )
    output.setBoard(boardDataFor(data, screen));
  if (team?.colors !== teamBefore?.colors) output.setTheme(outputThemeFor(data, screen));
}

let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
let recoveryRevision = 0;
let recoveryWrites: Promise<void> = Promise.resolve();

function scheduleRecovery(state: PictaState): void {
  recoveryRevision += 1;
  const revision = recoveryRevision;
  if (recoveryTimer !== null) clearTimeout(recoveryTimer);
  const { platform } = rt();
  if (!anyDirty(state.doc)) {
    recoveryWrites = recoveryWrites
      .then(async () => {
        if (revision === recoveryRevision) await platform.recovery.discard();
      })
      .catch(() => undefined);
    return;
  }
  recoveryTimer = setTimeout(() => {
    recoveryTimer = null;
    recoveryWrites = recoveryWrites
      .then(async () => {
        if (revision !== recoveryRevision) return;
        const doc = store.getState().doc;
        if (!anyDirty(doc)) {
          await platform.recovery.discard();
          return;
        }
        await platform.recovery.write(createRecoverySnapshot(doc));
      })
      .catch(() => undefined);
  }, 900);
}

/** A clean shutdown must not resurrect work the operator chose not to keep. */
export async function clearRecovery(): Promise<void> {
  if (recoveryTimer !== null) clearTimeout(recoveryTimer);
  recoveryTimer = null;
  recoveryRevision += 1;
  await recoveryWrites.catch(() => undefined);
  await rt().platform.recovery.discard();
}

export function windowTitle(state: PictaState): string {
  const name = showTitle(state.doc, state.pathStyle);
  return `${anyDirty(state.doc) ? '• ' : ''}${name} — Picta`;
}

export function startSync(): () => void {
  let lastTitle = '';
  const unsubscribe = store.subscribe((state, previous) => {
    syncOutput(state, previous);
    if (!state.booted) return;
    const title = windowTitle(state);
    if (title !== lastTitle) {
      lastTitle = title;
      void rt()
        .platform.window.setTitle(title)
        .catch(() => undefined);
    }
    if (
      state.doc !== previous.doc &&
      (state.doc.show !== previous.doc.show ||
        state.doc.mediaDirty !== previous.doc.mediaDirty ||
        state.doc.teamDirty !== previous.doc.teamDirty ||
        state.doc.mediaFilePath !== previous.doc.mediaFilePath ||
        state.doc.teamFilePath !== previous.doc.teamFilePath)
    )
      scheduleRecovery(state);
  });
  return () => {
    unsubscribe();
    if (recoveryTimer !== null) clearTimeout(recoveryTimer);
    recoveryTimer = null;
    appliedScreen = null;
  };
}
