/**
 * Double-buffered image swapping, modelled as a pure state machine so the
 * crossfade rules can be tested without a webview.
 *
 * The rules that keep the presentation display clean:
 *  - Two layers, `a` and `b`. One is visible, the other is loading.
 *  - An image is never made visible before it has fully decoded, so there are
 *    no white flashes, black flashes, broken-image icons or half-drawn frames.
 *  - This holds for the `none` transition too: `none` means "no crossfade",
 *    not "swap early".
 *  - A request that is superseded before it decodes is dropped, so a burst of
 *    Next presses cannot leave a stale image on screen.
 */

export type Layer = 'a' | 'b';

export interface LoadRequest {
  readonly token: number;
  readonly layer: Layer;
  readonly path: string;
  readonly index: number;
}

export interface SwapOutcome {
  readonly kind: 'swap';
  readonly request: LoadRequest;
  /** Layer that is now hidden and whose image resource can be released. */
  readonly retired: Layer;
}

export interface IgnoredOutcome {
  readonly kind: 'ignored';
}

export interface FailedOutcome {
  readonly kind: 'failed';
  readonly request: LoadRequest;
}

export type Outcome = SwapOutcome | IgnoredOutcome | FailedOutcome;

export function otherLayer(layer: Layer): Layer {
  return layer === 'a' ? 'b' : 'a';
}

export class DoubleBuffer {
  #visible: Layer = 'a';
  #pending: LoadRequest | null = null;
  #token = 0;
  /** Index currently on screen, or -1 before the first image appears. */
  #shownIndex = -1;
  #shownPath: string | null = null;

  get visibleLayer(): Layer {
    return this.#visible;
  }

  get pending(): LoadRequest | null {
    return this.#pending;
  }

  get shownIndex(): number {
    return this.#shownIndex;
  }

  get shownPath(): string | null {
    return this.#shownPath;
  }

  /**
   * Begin loading `path` into the hidden layer. Any earlier in-flight request
   * is abandoned; its eventual result will be ignored via the token.
   */
  request(path: string, index: number): LoadRequest {
    this.#token += 1;
    const request: LoadRequest = {
      token: this.#token,
      layer: otherLayer(this.#visible),
      path,
      index,
    };
    this.#pending = request;
    return request;
  }

  /** Report a successful decode. Only the newest request may swap. */
  decoded(token: number): Outcome {
    const pending = this.#pending;
    if (!pending || pending.token !== token) return { kind: 'ignored' };
    this.#pending = null;
    const retired = this.#visible;
    this.#visible = pending.layer;
    this.#shownIndex = pending.index;
    this.#shownPath = pending.path;
    return { kind: 'swap', request: pending, retired };
  }

  /** Report a decode failure. The visible layer keeps its current image. */
  failed(token: number): Outcome {
    const pending = this.#pending;
    if (!pending || pending.token !== token) return { kind: 'ignored' };
    this.#pending = null;
    return { kind: 'failed', request: pending };
  }

  /** Drop any in-flight request without touching what is on screen. */
  abandon(): void {
    this.#pending = null;
    this.#token += 1;
  }

  reset(): void {
    this.#visible = 'a';
    this.#pending = null;
    this.#token += 1;
    this.#shownIndex = -1;
    this.#shownPath = null;
  }
}
