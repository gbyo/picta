/**
 * The controller's single application store.
 *
 * One Zustand store holds document, output, display and UI state. Actions live
 * in `src/controller/actions/*` as plain functions so they can be called from
 * React, from native menu and keyboard handlers, and from tests alike. React
 * components subscribe to narrow slices with selectors, so a point scored does
 * not re-render the roster.
 */

import { createStore, useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { CueQueueState } from '@core/cues.js';
import type { ShowDocument } from '@core/domain.js';
import type { ManualGroupSession } from '@core/manual-group.js';
import type { DisplayHint, DisplayInfo } from '@core/monitors.js';
import type { PathStyle } from '@core/paths.js';
import { createScoreHistory, defaultVolleyballScore, type ScoreHistory } from '@core/score.js';
import { defaultShowDocument } from '@core/show-file.js';
import { emptyStatLog, type StatLog } from '@core/stat-log.js';
import type { UpdateStatus } from '@core/update.js';
import type { CueContext } from '@app/output-controller.js';
import type { MediaPreflightResult } from '@app/media-preflight.js';
import { emptyPrefs, type Prefs } from '@app/prefs.js';

export type Mode = 'console' | 'media' | 'roster' | 'screens';

export type OutputPhase = 'off' | 'preparing' | 'live' | 'stopping';

/** Where a Go Live attempt currently is, in operator language. */
export type PrepareStage =
  | 'checking-display'
  | 'checking-media'
  | 'opening-window'
  | 'renderer'
  | 'screen'
  | 'initial-media'
  | 'revealing';

export interface OutputFailure {
  title: string;
  detail: string;
  at: number;
}

export interface DocumentState {
  show: { filePath: string | null; data: ShowDocument; dirty: boolean };
  mediaFilePath: string | null;
  mediaDirty: boolean;
  teamFilePath: string | null;
  teamDirty: boolean;
}

export interface MediaNow {
  itemId: string | null;
  position: number;
  total: number;
  /** When the current item became visible (ms epoch), for the hold meter. */
  since: number;
}

export interface CueNow {
  state: CueQueueState;
  context: CueContext | null;
  /** When the current cue started, for the hold meter. */
  since: number;
}

export interface OutputState {
  phase: OutputPhase;
  stage: PrepareStage | null;
  /** The Screen on the audience display while live. */
  liveScreenId: string | null;
  startedAt: number | null;
  failure: OutputFailure | null;
  media: MediaNow;
  cue: CueNow;
  /** Rotation items preflight excluded from the current run. */
  skippedItemIds: string[];
}

export type ActivityLevel = 'info' | 'success' | 'warning' | 'error';

export interface ActivityEntry {
  id: number;
  level: ActivityLevel;
  text: string;
  at: number;
}

export interface PictaState {
  booted: boolean;
  native: boolean;
  pathStyle: PathStyle;
  prefs: Prefs;

  doc: DocumentState;
  scoreHistory: ScoreHistory;
  statLog: StatLog;

  displays: DisplayInfo[];
  selectedDisplayId: string | null;
  /** The display the controller window itself sits on, when known. */
  controllerDisplayId: string | null;
  /** Remembered after a display disappears so its return can be recognised. */
  lostDisplayHint: DisplayHint | null;
  /** True when the remembered display could not be told apart from a twin. */
  displayAmbiguous: boolean;

  output: OutputState;
  /** The Screen that Go Live will start with (and the switcher's selection off air). */
  armedScreenId: string;
  manual: ManualGroupSession | null;
  preflight: { result: MediaPreflightResult | null; running: boolean; revision: number };

  mode: Mode;
  consoleTab: 'stats' | 'cues';
  statsGroupId: string | null;
  selectedMediaIds: string[];
  selectedPlayerId: string | null;
  selectedGroupId: string | null;
  editingScreenId: string | null;
  selectedPanelId: string | null;
  showSafeArea: boolean;
  fileDrag: { paths: string[] } | null;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  theme: 'dark' | 'light';

  activity: ActivityEntry[];
  update: UpdateStatus | null;
}

const idleCue: CueQueueState = { active: false, index: -1, total: 0, current: null };

export function initialOutputState(): OutputState {
  return {
    phase: 'off',
    stage: null,
    liveScreenId: null,
    startedAt: null,
    failure: null,
    media: { itemId: null, position: 0, total: 0, since: 0 },
    cue: { state: idleCue, context: null, since: 0 },
    skippedItemIds: [],
  };
}

export function documentFor(data: ShowDocument = defaultShowDocument()): DocumentState {
  return {
    show: { filePath: null, data, dirty: false },
    mediaFilePath: data.media.kind === 'file' ? data.media.path : null,
    mediaDirty: false,
    teamFilePath: data.team?.kind === 'file' ? data.team.path : null,
    teamDirty: false,
  };
}

export function initialState(): PictaState {
  const doc = documentFor();
  return {
    booted: false,
    native: false,
    pathStyle: 'posix',
    prefs: { ...emptyPrefs },
    doc,
    scoreHistory: createScoreHistory(doc.show.data.event.score ?? defaultVolleyballScore()),
    statLog: emptyStatLog(),
    displays: [],
    selectedDisplayId: null,
    controllerDisplayId: null,
    lostDisplayHint: null,
    displayAmbiguous: false,
    output: initialOutputState(),
    armedScreenId: doc.show.data.defaultScreenId,
    manual: null,
    preflight: { result: null, running: false, revision: 0 },
    mode: 'console',
    consoleTab: 'stats',
    statsGroupId: null,
    selectedMediaIds: [],
    selectedPlayerId: null,
    selectedGroupId: null,
    editingScreenId: null,
    selectedPanelId: null,
    showSafeArea: false,
    fileDrag: null,
    paletteOpen: false,
    shortcutsOpen: false,
    theme: 'dark',
    activity: [],
    update: null,
  };
}

export const store = createStore<PictaState>()(() => initialState());

export const getState = store.getState;
export const setState = store.setState;

/** Reset everything; used by tests and by the browser demo. */
export function resetStore(): void {
  store.setState(initialState(), true);
}

export function usePicta<T>(selector: (state: PictaState) => T): T {
  return useStore(store, selector);
}

/** Subscribe to several values at once without re-rendering on unrelated changes. */
export function usePictaShallow<T extends object>(selector: (state: PictaState) => T): T {
  return useStore(store, useShallow(selector));
}

let activityId = 0;

export function logActivity(level: ActivityLevel, text: string): void {
  activityId += 1;
  const entry: ActivityEntry = { id: activityId, level, text, at: Date.now() };
  store.setState((state) => ({ activity: [...state.activity.slice(-99), entry] }));
}
