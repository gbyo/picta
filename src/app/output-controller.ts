/**
 * Controller-side output orchestration for mixed media, zones and cues.
 * Native display placement remains in ipc.ts; this module owns sequencing.
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  EVENT_BACKGROUND,
  EVENT_BOARD,
  EVENT_CLEAR,
  EVENT_CUE,
  EVENT_CUE_END,
  EVENT_LAYOUT,
  EVENT_LAYOUT_EDIT_BEGIN,
  EVENT_LAYOUT_EDIT_END,
  EVENT_LAYOUT_EDIT_UPDATE,
  EVENT_PLAYBACK,
  EVENT_READY,
  EVENT_RESULT,
  EVENT_THEME,
  type BackgroundMediaMessage,
  type BoardMessage,
  type CueMessage,
  type LayoutEditPreviewMessage,
  type PlaybackEvent,
  type ResultMessage,
  type ThemeMessage,
} from './events.js';
import type { BoardData, Cue, LayoutNode, MediaSet } from '../core/domain.js';
import { layoutZones, zoneIdForRole } from '../core/layouts.js';
import { CueQueue, type CueOutcome, type CueQueueState } from '../core/cues.js';
import { MediaPlaybackMachine, type MediaPlaybackEvent } from '../core/media-playback.js';
import { CROSSFADE_MS } from '../core/types.js';

const PRESENTATION = 'presentation';
const READY_TIMEOUT_MS = 5000;

export interface OutputSettings {
  intervalSeconds: number;
  transition: 'none' | 'crossfade';
  imageSizing: 'fit' | 'fill';
  layout: LayoutNode;
}

export type OutputStopReason = 'user' | 'exhausted' | 'display-lost';

/**
 * What the operator asked for, so the controller can label its cue controls
 * without exposing the queue abstraction.  One playback engine underneath.
 */
export type CueContextKind = 'ordered-group' | 'single-player' | 'single-media';

export interface CueContext {
  kind: CueContextKind;
  /** Short operator-facing name, e.g. "Starting Lineup" or "#14 Dana Whitfield". */
  label: string;
}

export interface OutputHandlers {
  onPosition(position: number, total: number): void;
  onStopped(reason: OutputStopReason): void;
  onCueState(state: CueQueueState): void;
  onWarning(message: string): void;
}

export class OutputController {
  #handlers: OutputHandlers;
  #unlisten: UnlistenFn[] = [];
  #ready = false;
  #readyWaiters: (() => void)[] = [];
  #active = false;
  #set: MediaSet = {
    version: 1,
    name: 'Inline Media',
    items: [],
    transition: 'crossfade',
    imageSizing: 'fit',
    imageDurationSeconds: 10,
  };
  #settings: OutputSettings | null = null;
  #machine: MediaPlaybackMachine | null = null;
  #imageTimer: number | null = null;
  #cueToken = 1000000;
  #pendingCueResolve: ((played: boolean) => void) | null = null;
  #cueTimer: number | null = null;
  #mediaToken = 0;
  #editing = false;
  #editFrame: number | null = null;
  #pendingEditMessage: LayoutEditPreviewMessage | null = null;
  #theme: ThemeMessage = {
    primary: '#111111',
    secondary: '#ffffff',
    foreground: '#ffffff',
    background: 'black',
  };
  #cueQueue: CueQueue;

  constructor(handlers: OutputHandlers) {
    this.#handlers = handlers;
    this.#cueQueue = new CueQueue(
      {
        run: (cue) => this.#runCue(cue),
        cancel: () => this.#cancelCuePresentation(),
      },
      {
        onState: (state) => this.#handlers.onCueState(state),
        onSkipped: (cue, _index, reason) => {
          // Cancelling is the operator's choice, not something to warn about.
          if (reason !== 'failed') return;
          this.#handlers.onWarning(
            `Skipped ${cue.type.replace('-', ' ')} because it could not play.`,
          );
        },
      },
    );
  }

  get active(): boolean {
    return this.#active;
  }

  get cueActive(): boolean {
    return this.#cueQueue.active;
  }

  get cueState(): CueQueueState {
    return this.#cueQueue.state;
  }

  async init(): Promise<void> {
    this.#unlisten.push(
      await listen<ResultMessage>(EVENT_RESULT, (event) =>
        this.#onReady(event.payload.token, event.payload.ok, event.payload.zoneId),
      ),
    );
    this.#unlisten.push(
      await listen<PlaybackEvent>(EVENT_PLAYBACK, (event) => this.#onPlayback(event.payload)),
    );
    this.#unlisten.push(
      await listen(EVENT_READY, () => {
        this.#ready = true;
        const waiters = this.#readyWaiters;
        this.#readyWaiters = [];
        for (const resolve of waiters) resolve();
      }),
    );
  }

  resetReady(): void {
    this.#ready = false;
    this.#readyWaiters = [];
  }

  async dispose(): Promise<void> {
    this.stop('user');
    for (const off of this.#unlisten) off();
    this.#unlisten = [];
  }

  async begin(set: MediaSet, settings: OutputSettings, board?: BoardData): Promise<boolean> {
    this.stop('user', false);
    this.#editing = false;
    this.#set = {
      ...set,
      // Missing resources are controller state, not a renderer concern.
      items: set.items.filter((item) => !item.missing),
    };
    this.#settings = settings;
    this.#machine = new MediaPlaybackMachine(this.#set);
    this.#active = true;
    await this.#waitForPresentation();
    await emitTo(PRESENTATION, EVENT_LAYOUT, { layout: settings.layout }).catch(() => undefined);
    void emitTo(PRESENTATION, EVENT_THEME, this.#theme).catch(() => undefined);
    if (board) this.setBoard(board);
    if (this.#set.items.length === 0) {
      this.#handlers.onPosition(0, 0);
      return true;
    }
    const request = this.#machine.start();
    if (!request || request.type === 'stopped') {
      this.stop('exhausted');
      return false;
    }
    this.#dispatchMedia(request);
    return true;
  }

  stop(reason: OutputStopReason = 'user', notify = true): void {
    if (!this.#active && !this.#cueQueue.active) return;
    this.#cueQueue.cancel(false);
    this.#editing = false;
    this.#cancelEditFrame();
    this.#cancelCuePresentation();
    this.#clearTimer();
    this.#machine?.stop();
    this.#machine = null;
    this.#active = false;
    void emitTo(PRESENTATION, EVENT_CLEAR, {}).catch(() => undefined);
    if (notify) this.#handlers.onStopped(reason);
  }

  abandon(): void {
    this.#cueQueue.cancel(false);
    this.#editing = false;
    this.#cancelEditFrame();
    this.#cancelCuePresentation();
    this.#clearTimer();
    this.#machine?.stop();
    this.#machine = null;
    this.#active = false;
  }

  setLayout(layout: LayoutNode): void {
    const current = this.#cueQueue.state.current;
    const preserveCue = current?.target === 'full-board';
    if (this.#cueQueue.active && !preserveCue) this.#cueQueue.cancel();
    this.#applyLayout(layout, preserveCue);
  }

  /** Apply a scene while preserving a full-board cue under the new layout. */
  applyScene(scene: { layout: LayoutNode }, board?: BoardData): void {
    if (this.#editing) return;
    const current = this.#cueQueue.state.current;
    const fullBoardCue = current?.target === 'full-board';
    if (this.#cueQueue.active && !fullBoardCue) this.#cueQueue.cancel();
    this.#applyLayout(scene.layout, fullBoardCue);
    if (board) this.setBoard(board);
  }

  beginLayoutEdit(message: LayoutEditPreviewMessage): void {
    if (!this.#active) return;
    if (this.#cueQueue.active) this.#cueQueue.cancel();
    this.#clearTimer();
    this.#machine?.pause();
    this.#editing = true;
    void emitTo(PRESENTATION, EVENT_CLEAR, {}).catch(() => undefined);
    void emitTo(PRESENTATION, EVENT_LAYOUT_EDIT_BEGIN, message).catch(() => undefined);
  }

  previewLayout(message: LayoutEditPreviewMessage): void {
    if (!this.#editing) return;
    this.#pendingEditMessage = message;
    if (this.#editFrame !== null) return;
    const flush = () => {
      this.#editFrame = null;
      const pending = this.#pendingEditMessage;
      this.#pendingEditMessage = null;
      if (pending && this.#editing)
        void emitTo(PRESENTATION, EVENT_LAYOUT_EDIT_UPDATE, pending).catch(() => undefined);
    };
    if (typeof window.requestAnimationFrame === 'function')
      this.#editFrame = window.requestAnimationFrame(flush);
    else this.#editFrame = window.setTimeout(flush, 0);
  }

  endLayoutEdit(layout: LayoutNode, board?: BoardData): void {
    if (!this.#editing) return;
    this.#cancelEditFrame();
    this.#editing = false;
    this.#applyLayout(layout, true);
    if (board) this.setBoard(board);
    void emitTo(PRESENTATION, EVENT_LAYOUT_EDIT_END, {}).catch(() => undefined);
    const resumed = this.#machine?.resume();
    if (resumed?.type === 'request') this.#dispatchMedia(resumed);
  }

  setTheme(theme: ThemeMessage): void {
    this.#theme = { ...theme };
    if (this.#active) void emitTo(PRESENTATION, EVENT_THEME, this.#theme).catch(() => undefined);
  }

  setBoard(data: BoardData): void {
    if (!this.#active) return;
    const message: BoardMessage = { data };
    void emitTo(PRESENTATION, EVENT_BOARD, message).catch(() => undefined);
  }

  next(): void {
    this.#step(1);
  }

  previous(): void {
    this.#step(-1);
  }

  /** Run one cue and report whether the audience actually saw it. */
  async playCue(cue: Cue, context: CueContext): Promise<CueOutcome> {
    const outcomes = await this.playCues([cue], context);
    return outcomes[0] ?? 'failed';
  }

  async playCues(
    cues: readonly Cue[],
    context: CueContext,
    sources: ReadonlyMap<string, string> = new Map(),
    photos: ReadonlyMap<string, string> = new Map(),
  ): Promise<CueOutcome[]> {
    if (!this.#active) return [];
    // Sources are held separately so the pure Cue data stays serializable.
    this.#cueSources = sources;
    this.#cuePhotos = photos;
    this.#cueContext = context;
    return this.#cueQueue.play(cues);
  }

  get cueContext(): CueContext | null {
    return this.#cueQueue.active ? this.#cueContext : null;
  }

  cancelCue(): void {
    this.#cueQueue.cancel();
  }

  nextCue(): void {
    this.#cueQueue.next();
  }

  previousCue(): void {
    this.#cueQueue.previous();
  }

  #cueSources: ReadonlyMap<string, string> = new Map();
  #cuePhotos: ReadonlyMap<string, string> = new Map();
  #cueContext: CueContext | null = null;

  #step(direction: 1 | -1): void {
    if (!this.#active || !this.#machine) return;
    if (this.#cueQueue.active) this.#cueQueue.cancel();
    this.#clearTimer();
    const event = this.#machine.request(direction);
    if (!event || event.type === 'stopped') {
      this.stop('exhausted');
      return;
    }
    this.#dispatchMedia(event);
  }

  #dispatchMedia(event: MediaPlaybackEvent): void {
    if (event.type !== 'request' || !this.#settings || this.#editing) return;
    const programZoneId = zoneIdForRole(this.#settings.layout, 'program');
    if (!programZoneId) return;
    this.#mediaToken = event.token;
    const request: BackgroundMediaMessage = {
      token: event.token,
      zoneId: programZoneId,
      src: convertFileSrc(event.item.path),
      type: event.item.type,
      sizing: this.#settings.imageSizing,
      transition: this.#settings.transition,
      fadeMs: CROSSFADE_MS,
      muted: false,
    };
    void emitTo(PRESENTATION, EVENT_BACKGROUND, request).catch(() => this.stop('display-lost'));
    for (const zone of layoutZones(this.#settings.layout).filter((item) => item.role === 'media')) {
      void emitTo(PRESENTATION, EVENT_BACKGROUND, {
        ...request,
        zoneId: zone.id,
        muted: true,
      }).catch(() => undefined);
    }
  }

  #onReady(token: number, ok: boolean, zoneId?: string): void {
    if (!this.#active || this.#editing || !this.#settings) return;
    const programZoneId = zoneIdForRole(this.#settings.layout, 'program');
    if (zoneId && zoneId !== programZoneId) return;
    const machine = this.#machine;
    if (!machine) return;
    const event = ok ? machine.ready(token) : machine.failed(token);
    if (event?.type === 'wait-image') {
      this.#clearTimer();
      this.#imageTimer = window.setTimeout(() => {
        this.#imageTimer = null;
        const next = machine.imageTimerFired(event.index);
        if (next?.type === 'request') this.#dispatchMedia(next);
      }, event.durationMs);
    } else if (event?.type === 'failed') {
      this.#handlers.onWarning(
        `Skipped ${event.path.split(/[\\/]/).pop() ?? 'media'} because it could not play.`,
      );
      const next = machine.request(1);
      if (next?.type === 'request') this.#dispatchMedia(next);
      else this.stop('exhausted');
    }
    if (event?.type === 'wait-image' || (event === null && machine.state.currentIndex >= 0)) {
      const state = machine.state;
      this.#handlers.onPosition(state.currentIndex + 1, this.#set.items.length);
    }
  }

  #onPlayback(event: PlaybackEvent): void {
    if (!this.#active || !this.#machine || this.#editing || !this.#settings) return;
    const programZoneId = zoneIdForRole(this.#settings.layout, 'program');
    if (event.zoneId && event.zoneId !== programZoneId) return;
    if (
      this.#pendingCueResolve &&
      (event.event === 'ended' || event.event === 'failed') &&
      event.token === this.#cueToken
    ) {
      const resolve = this.#pendingCueResolve;
      this.#pendingCueResolve = null;
      resolve(event.event === 'ended');
      return;
    }
    if (this.#cueQueue.active) return;
    if (event.token !== this.#mediaToken) return;
    if (event.event !== 'ended' && event.event !== 'failed') return;
    const item = this.#set.items[this.#machine.state.currentIndex];
    if (!item || item.type !== 'video') return;
    if (event.event === 'failed') {
      const failed = this.#machine.failed(event.token);
      if (failed?.type === 'failed') {
        const next = this.#machine.request(1);
        if (next?.type === 'request') this.#dispatchMedia(next);
        else this.stop('exhausted');
      }
      return;
    }
    const next = this.#machine.videoEnded(this.#machine.state.currentIndex);
    if (next?.type === 'request') this.#dispatchMedia(next);
  }

  async #runCue(cue: Cue): Promise<boolean> {
    if (!this.#active) return false;
    this.#clearTimer();
    const wasCurrent = this.#machine?.state.currentIndex ?? -1;
    this.#cueToken += 1;
    const token = this.#cueToken;
    const message: CueMessage = {
      cue,
      token,
      ...(cue.type === 'video'
        ? { src: this.#cueSources.get(cue.path) ?? convertFileSrc(cue.path) }
        : {}),
      ...(cue.type === 'image'
        ? { src: this.#cueSources.get(cue.path) ?? convertFileSrc(cue.path) }
        : {}),
      ...(cue.type === 'player-card' && cue.photo?.path
        ? { photoSrc: this.#cuePhotos.get(cue.photo.path) ?? convertFileSrc(cue.photo.path) }
        : {}),
    };
    await emitTo(PRESENTATION, EVENT_CUE, message).catch(() => undefined);
    if (this.#cueToken !== token || !this.#cueQueue.active) return false;
    const holdMs =
      cue.type === 'video'
        ? null
        : cue.type === 'player-card' || cue.type === 'image'
          ? cue.holdMs
          : 1000;
    return new Promise<boolean>((resolve) => {
      this.#pendingCueResolve = resolve;
      if (holdMs !== null) {
        this.#cueTimer = window.setTimeout(
          () => {
            this.#cueTimer = null;
            const finish = this.#pendingCueResolve;
            this.#pendingCueResolve = null;
            finish?.(true);
          },
          Math.max(250, holdMs),
        );
      }
    }).finally(() => {
      if (this.#cueToken !== token) return;
      this.#pendingCueResolve = null;
      void emitTo(PRESENTATION, EVENT_CUE_END, {}).catch(() => undefined);
      this.#resumeBackground(wasCurrent);
    });
  }

  #resumeBackground(index: number): void {
    if (!this.#active || !this.#settings || !this.#machine || index < 0) return;
    const event = this.#machine.replayCurrent();
    if (event?.type === 'request') this.#dispatchMedia(event);
  }

  #cancelCuePresentation(): void {
    this.#clearTimer();
    this.#cueToken += 1;
    const resolve = this.#pendingCueResolve;
    this.#pendingCueResolve = null;
    if (resolve) resolve(false);
    void emitTo(PRESENTATION, EVENT_CUE_END, {}).catch(() => undefined);
  }

  #clearTimer(): void {
    if (this.#imageTimer !== null) {
      window.clearTimeout(this.#imageTimer);
      this.#imageTimer = null;
    }
    if (this.#cueTimer !== null) {
      window.clearTimeout(this.#cueTimer);
      this.#cueTimer = null;
    }
  }

  #applyLayout(layout: LayoutNode, preserveCue = false): void {
    if (this.#settings) this.#settings = { ...this.#settings, layout };
    if (!this.#active || this.#editing) return;
    void emitTo(PRESENTATION, EVENT_LAYOUT, { layout }).catch(() => undefined);
    if (preserveCue) return;
    const current = this.#machine?.replayCurrent();
    if (current?.type === 'request') this.#dispatchMedia(current);
  }

  #cancelEditFrame(): void {
    if (this.#editFrame !== null) {
      if (typeof window.cancelAnimationFrame === 'function')
        window.cancelAnimationFrame(this.#editFrame);
      else window.clearTimeout(this.#editFrame);
      this.#editFrame = null;
    }
    this.#pendingEditMessage = null;
  }

  #waitForPresentation(): Promise<void> {
    if (this.#ready) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve();
      }, READY_TIMEOUT_MS);
      this.#readyWaiters.push(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve();
      });
    });
  }
}
