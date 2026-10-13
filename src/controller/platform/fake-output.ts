/**
 * A simulated output used by the browser demo and by controller tests.
 *
 * It honours the same contract as OutputController — staged begin, rotation
 * positions, serial cues with honest outcomes, stop reasons — without a
 * presentation window. Every call is recorded so tests can assert what the
 * controller asked the audience display to do.
 */

import { CueQueue, type CueOutcome, type CueQueueState } from '@core/cues.js';
import type { BoardData, Cue, MediaItem, MediaSet, VolleyballScoreState } from '@core/domain.js';
import { mediaDurationSeconds } from '@core/media.js';
import type { ThemeMessage } from '@app/events.js';
import type { CueContext, OutputHandlers, OutputSettings } from '@app/output-controller.js';
import type { BeginFailure, OutputPort } from './types.js';

export interface FakeOutputOptions {
  /** Delay for each simulated startup stage. 0 resolves on the next microtask. */
  stageDelayMs?: number;
  /** Force begin() to fail with this reason. */
  failWith?: Exclude<BeginFailure, null>;
  /** Simulated length of a video, in milliseconds. */
  videoMs?: number;
  /** Image hold override in milliseconds (otherwise the item duration). */
  imageMs?: number;
  /** Advance the rotation on timers. Tests usually drive it explicitly. */
  autoAdvance?: boolean;
}

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export class FakeOutput implements OutputPort {
  readonly calls: RecordedCall[] = [];
  options: FakeOutputOptions;
  #handlers: OutputHandlers;
  #active = false;
  #items: MediaItem[] = [];
  #set: MediaSet | null = null;
  #index = -1;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #cueTimer: ReturnType<typeof setTimeout> | null = null;
  #cueResolve: ((played: boolean) => void) | null = null;
  #lastBeginFailure: BeginFailure = null;
  #context: CueContext | null = null;
  #queue: CueQueue;
  #session = 0;
  #hasMediaPanel = true;

  constructor(handlers: OutputHandlers, options: FakeOutputOptions = {}) {
    this.#handlers = handlers;
    this.options = options;
    this.#queue = new CueQueue(
      {
        run: (cue) => this.#runCue(cue),
        cancel: () => this.#cancelCuePresentation(),
      },
      {
        onState: (state) => this.#handlers.onCueState(state),
        onSkipped: (cue, _index, reason) => {
          if (reason === 'failed')
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
    return this.#queue.active;
  }
  get cueState(): CueQueueState {
    return this.#queue.state;
  }
  get cueContext(): CueContext | null {
    return this.#queue.active ? this.#context : null;
  }
  get lastBeginFailure(): BeginFailure {
    return this.#lastBeginFailure;
  }
  get currentItemId(): string | null {
    return this.#items[this.#index]?.id ?? null;
  }

  #record(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  callsTo(method: string): RecordedCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  async init(): Promise<void> {
    this.#record('init');
  }

  async dispose(): Promise<void> {
    this.#record('dispose');
    this.stop('user', false);
  }

  resetReady(): void {
    this.#record('resetReady');
  }

  async #stage(): Promise<void> {
    const delay = this.options.stageDelayMs ?? 0;
    if (delay <= 0) await Promise.resolve();
    else await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async begin(
    set: MediaSet,
    settings: OutputSettings,
    board?: BoardData,
    score?: VolleyballScoreState,
  ): Promise<boolean> {
    this.#record('begin', set, settings, board, score);
    this.stop('user', false);
    const session = ++this.#session;
    this.#lastBeginFailure = null;
    this.#set = set;
    this.#items = set.items.filter((item) => !item.missing);
    this.#index = -1;
    this.#hasMediaPanel = settings.screen
      ? settings.screen.panels.some((panel) => panel.content.kind === 'media')
      : true;
    this.#handlers.onStage?.('renderer');
    await this.#stage();
    if (session !== this.#session) return false;
    if (this.options.failWith === 'presentation-not-ready')
      return this.#fail('presentation-not-ready');
    this.#handlers.onStage?.('screen');
    await this.#stage();
    if (session !== this.#session) return false;
    if (this.options.failWith === 'screen-not-ready') return this.#fail('screen-not-ready');
    this.#active = true;
    if (this.#items.length === 0 || !this.#hasMediaPanel) {
      this.#handlers.onPosition(0, 0);
      return true;
    }
    this.#handlers.onStage?.('initial-media');
    await this.#stage();
    if (session !== this.#session) return false;
    if (this.options.failWith === 'initial-content-not-ready') {
      this.#active = false;
      return this.#fail('initial-content-not-ready');
    }
    this.#show(0);
    return true;
  }

  #fail(reason: Exclude<BeginFailure, null>): false {
    this.#lastBeginFailure = reason;
    this.#active = false;
    this.#handlers.onWarning(
      reason === 'initial-content-not-ready'
        ? 'Initial media did not finish loading. Nothing was shown.'
        : reason === 'screen-not-ready'
          ? 'The Screen did not finish loading. Nothing was shown.'
          : 'The output window did not finish starting.',
    );
    return false;
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #show(index: number): void {
    const item = this.#items[index];
    if (!item) return;
    this.#index = index;
    this.#handlers.onPosition(index + 1, this.#items.length, item);
    this.#clearTimer();
    if (!this.options.autoAdvance || this.#queue.active) return;
    const ms =
      item.type === 'video'
        ? (this.options.videoMs ?? 8000)
        : (this.options.imageMs ??
          (this.#set ? mediaDurationSeconds(item, this.#set) * 1000 : 10000));
    this.#timer = setTimeout(() => this.#step(1), ms);
  }

  #step(direction: 1 | -1): void {
    if (!this.#active || this.#items.length === 0 || !this.#hasMediaPanel) return;
    if (this.#queue.active) this.#queue.cancel();
    const next = (this.#index + direction + this.#items.length) % this.#items.length;
    this.#show(next);
  }

  stop(reason: 'user' | 'exhausted' | 'display-lost' = 'user', notify = true): void {
    const wasActive = this.#active || this.#queue.active;
    this.#record('stop', reason);
    this.#session += 1;
    this.#queue.cancel(false);
    this.#cancelCuePresentation();
    this.#clearTimer();
    this.#active = false;
    this.#index = -1;
    if (notify && wasActive) this.#handlers.onStopped(reason);
  }

  abandon(): void {
    this.#record('abandon');
    this.#session += 1;
    this.#queue.cancel(false);
    this.#cancelCuePresentation();
    this.#clearTimer();
    this.#active = false;
  }

  applyScreen(
    screen: NonNullable<OutputSettings['screen']>,
    board?: BoardData,
    score?: VolleyballScoreState,
  ): void {
    this.#record('applyScreen', screen, board, score);
    if (!this.#active) return;
    const hadMedia = this.#hasMediaPanel;
    this.#hasMediaPanel = screen.panels.some((panel) => panel.content.kind === 'media');
    const cue = this.#queue.state.current;
    if (this.#queue.active && cue && cue.target !== 'full-board' && !screen.cueTargetPanelId)
      this.#queue.cancel();
    if (!hadMedia && this.#hasMediaPanel && this.#items.length > 0)
      this.#show(Math.max(0, this.#index));
  }

  setBoard(data: BoardData): void {
    this.#record('setBoard', data);
  }
  setScore(data: VolleyballScoreState): void {
    this.#record('setScore', data);
  }
  setTheme(theme: ThemeMessage): void {
    this.#record('setTheme', theme);
  }
  next(): void {
    this.#record('next');
    this.#step(1);
  }
  previous(): void {
    this.#record('previous');
    this.#step(-1);
  }
  jumpTo(itemId: string): void {
    this.#record('jumpTo', itemId);
    if (!this.#active || !this.#hasMediaPanel) return;
    const index = this.#items.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    if (this.#queue.active) this.#queue.cancel();
    this.#show(index);
  }

  async playCue(cue: Cue, context: CueContext): Promise<CueOutcome> {
    const outcomes = await this.playCues([cue], context);
    return outcomes[0] ?? 'failed';
  }

  async playCues(cues: readonly Cue[], context: CueContext): Promise<CueOutcome[]> {
    this.#record('playCues', cues, context);
    if (!this.#active) return [];
    this.#context = context;
    this.#clearTimer();
    const outcomes = await this.#queue.play(cues);
    if (this.#active && !this.#queue.active && this.#index >= 0) this.#show(this.#index);
    return outcomes;
  }

  cancelCue(): void {
    this.#record('cancelCue');
    this.#queue.cancel();
  }
  nextCue(): void {
    this.#record('nextCue');
    this.#queue.next();
  }
  previousCue(): void {
    this.#record('previousCue');
    this.#queue.previous();
  }

  /** Test hook: finish the cue on air as though it played to the end. */
  completeCue(played = true): void {
    if (this.#cueTimer !== null) clearTimeout(this.#cueTimer);
    this.#cueTimer = null;
    const resolve = this.#cueResolve;
    this.#cueResolve = null;
    resolve?.(played);
  }

  /** Test hook: the display vanished underneath the output. */
  loseDisplay(): void {
    this.stop('display-lost');
  }

  #runCue(cue: Cue): Promise<boolean> {
    if (!this.#active) return Promise.resolve(false);
    const hold =
      cue.type === 'video'
        ? (this.options.videoMs ?? 8000)
        : cue.type === 'player-card' || cue.type === 'image'
          ? cue.holdMs
          : 1000;
    return new Promise<boolean>((resolve) => {
      this.#cueResolve = resolve;
      if (this.options.autoAdvance)
        this.#cueTimer = setTimeout(() => this.completeCue(true), Math.max(250, hold));
    });
  }

  #cancelCuePresentation(): void {
    if (this.#cueTimer !== null) clearTimeout(this.#cueTimer);
    this.#cueTimer = null;
    const resolve = this.#cueResolve;
    this.#cueResolve = null;
    resolve?.(false);
  }
}
