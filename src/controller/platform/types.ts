/**
 * The controller's whole view of the outside world.
 *
 * React components and application actions never import Tauri directly. They
 * talk to a Platform, which is the real Tauri bridge in the desktop app, a
 * scripted fake in tests, and a self-contained demo in a plain browser. This
 * keeps the native surface auditable in one place (see tauri.ts) and lets the
 * operator workflows be tested end to end without a window system.
 */

import type { CueOutcome, CueQueueState } from '@core/cues.js';
import type {
  BoardData,
  Cue,
  MediaItem,
  MediaSet,
  ShowDocument,
  Team,
  VolleyballScoreState,
} from '@core/domain.js';
import type { DisplayInfo } from '@core/monitors.js';
import type { PathStyle } from '@core/paths.js';
import type { UpdateStatus } from '@core/update.js';
import type { ThemeMessage } from '@app/events.js';
import type {
  CueContext,
  OutputHandlers,
  OutputSettings,
  OutputStopReason,
} from '@app/output-controller.js';
import type { MediaPreflightResult } from '@app/media-preflight.js';
import type { Prefs } from '@app/prefs.js';
import type { RecoverySnapshot } from '@app/recovery.js';
import type { ResourceOpenResult } from '@app/resource-io.js';
import type { ShowOpenResult } from '@app/show-io.js';

export type BeginFailure =
  | 'presentation-not-ready'
  | 'screen-not-ready'
  | 'initial-content-not-ready'
  | 'presentation-unavailable'
  | 'no-usable-media'
  | null;

/** The subset of OutputController the controller UI relies on. */
export interface OutputPort {
  readonly active: boolean;
  readonly cueActive: boolean;
  readonly cueState: CueQueueState;
  readonly cueContext: CueContext | null;
  readonly lastBeginFailure: BeginFailure;
  init(): Promise<void>;
  dispose(): Promise<void>;
  resetReady(): void;
  begin(
    set: MediaSet,
    settings: OutputSettings,
    board?: BoardData,
    score?: VolleyballScoreState,
  ): Promise<boolean>;
  stop(reason?: OutputStopReason, notify?: boolean): void;
  abandon(): void;
  applyScreen(
    screen: NonNullable<OutputSettings['screen']>,
    board?: BoardData,
    score?: VolleyballScoreState,
  ): void;
  setBoard(data: BoardData): void;
  setScore(data: VolleyballScoreState): void;
  setTheme(theme: ThemeMessage): void;
  next(): void;
  previous(): void;
  jumpTo(itemId: string): void;
  playCue(cue: Cue, context: CueContext): Promise<CueOutcome>;
  playCues(cues: readonly Cue[], context: CueContext): Promise<CueOutcome[]>;
  cancelCue(): void;
  nextCue(): void;
  previousCue(): void;
}

export type SaveResult = { ok: true } | { ok: false; message: string };

export interface WindowGeometry {
  width: number;
  height: number;
  x: number;
  y: number;
}

export type Unlisten = () => void;

export interface Platform {
  /** True inside the Tauri desktop shell. */
  readonly native: boolean;
  pathStyle(): Promise<PathStyle>;
  /** Asset-protocol URL for a local file the controller may render. */
  assetUrl(path: string): string;

  createOutput(handlers: OutputHandlers): OutputPort;

  displays: {
    list(): Promise<DisplayInfo[]>;
    identify(): Promise<void>;
  };
  presentation: {
    prepare(displayId: string): Promise<DisplayInfo>;
    show(displayId: string): Promise<DisplayInfo>;
    close(): Promise<void>;
  };
  files: {
    allowMedia(paths: string[]): Promise<void>;
    pathsExist(paths: string[]): Promise<boolean[]>;
    reveal(path: string): Promise<void>;
    startupFile(): Promise<string | null>;
    openShow(path: string, style: PathStyle): Promise<ShowOpenResult>;
    saveShow(path: string, data: ShowDocument, style: PathStyle): Promise<SaveResult>;
    openMediaSet(path: string, style: PathStyle): Promise<ResourceOpenResult<MediaSet>>;
    saveMediaSet(path: string, data: MediaSet, style: PathStyle): Promise<SaveResult>;
    openTeam(path: string, style: PathStyle): Promise<ResourceOpenResult<Team>>;
    saveTeam(path: string, data: Team, style: PathStyle): Promise<SaveResult>;
  };
  dialogs: {
    chooseMedia(startDirectory: string | null): Promise<string[]>;
    chooseFolder(startDirectory: string | null, title: string): Promise<string | null>;
    chooseShowToOpen(startDirectory: string | null): Promise<string | null>;
    chooseShowToSave(startDirectory: string | null, name: string): Promise<string | null>;
    chooseTeamToOpen(startDirectory: string | null): Promise<string | null>;
    chooseTeamToSave(startDirectory: string | null, name: string): Promise<string | null>;
    chooseMediaSetToOpen(startDirectory: string | null): Promise<string | null>;
    chooseMediaSetToSave(startDirectory: string | null, name: string): Promise<string | null>;
  };
  preflight: {
    check(items: readonly MediaItem[]): Promise<MediaPreflightResult>;
    invalidate(paths?: readonly string[]): void;
  };
  prefs: {
    read(): Promise<Prefs>;
    write(prefs: Prefs): void;
    flush(prefs: Prefs): Promise<void>;
  };
  recovery: {
    read(): Promise<RecoverySnapshot | null>;
    write(snapshot: RecoverySnapshot): Promise<void>;
    discard(): Promise<void>;
  };
  updates: {
    check(): Promise<UpdateStatus | null>;
    openReleases(): Promise<void>;
  };
  window: {
    setTitle(title: string): Promise<void>;
    reveal(): Promise<void>;
    geometry(): Promise<WindowGeometry | null>;
    restoreGeometry(geometry: WindowGeometry, displays: readonly DisplayInfo[]): Promise<void>;
    quit(): Promise<void>;
  };
  events: {
    /** Native File/View/Output menu choices. */
    onMenu(handler: (id: string) => void): Promise<Unlisten>;
    /** Keys pressed while the presentation window has focus. */
    onPresentationKey(handler: (key: string) => void): Promise<Unlisten>;
    /** OS file drags over the controller window. */
    onFileDrag(handler: (event: FileDragEvent) => void): Promise<Unlisten>;
    /** The operator asked to close the controller window. */
    onCloseRequested(handler: () => Promise<void>): Promise<Unlisten>;
  };
}

export type FileDragEvent =
  | { type: 'enter'; paths: string[] }
  | { type: 'over' }
  | { type: 'leave' }
  | { type: 'drop'; paths: string[] };
