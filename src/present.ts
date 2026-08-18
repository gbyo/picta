/**
 * The presentation renderer.
 *
 * This window is deliberately dumb: it holds no playlist, no timer and no
 * knowledge of which display it is on. The controller sends "show this file
 * like this"; this file answers "shown" or "failed". Everything that could put
 * text, an error or a broken-image icon on the output screen is absent by
 * construction.
 */

import { emit, listen } from '@tauri-apps/api/event';
import { EVENT_CLEAR, EVENT_KEY, EVENT_READY, EVENT_RESULT, EVENT_SHOW } from './app/events.js';
import type { ShowRequest } from './app/events.js';

type Layer = 'a' | 'b';

const layers: Record<Layer, HTMLImageElement> = {
  a: document.getElementById('layer-a') as HTMLImageElement,
  b: document.getElementById('layer-b') as HTMLImageElement,
};

let visible: Layer = 'a';
/** Highest token seen. Anything older is a superseded request and is dropped. */
let latestToken = 0;
let retireHandle: number | null = null;

function other(layer: Layer): Layer {
  return layer === 'a' ? 'b' : 'a';
}

/**
 * Release the decoded bitmap held by a hidden layer.
 *
 * `removeAttribute` rather than `src = ''`: an empty string resolves to the
 * document URL and would leave the element in a broken state. The layer is at
 * opacity 0 either way, so nothing is visible during the swap.
 */
function retire(layer: Layer): void {
  const element = layers[layer];
  element.removeAttribute('src');
}

async function show(request: ShowRequest): Promise<void> {
  const { token, src, sizing, transition, fadeMs } = request;
  if (token < latestToken) return;
  latestToken = token;

  const target = other(visible);
  const element = layers[target];
  const previous = layers[visible];

  element.classList.remove('visible');
  element.style.transitionDuration = '0ms';
  element.className = `layer ${sizing}`;
  element.src = src;

  try {
    // Resolves only once the image is fully decoded, so the crossfade can never
    // reveal a partially drawn or still-loading frame.
    await element.decode();
  } catch {
    retire(target);
    await emit(EVENT_RESULT, { token, ok: false });
    return;
  }

  // A newer request arrived while this one was decoding: drop this one silently.
  if (token < latestToken) {
    retire(target);
    return;
  }

  const duration = transition === 'crossfade' ? fadeMs : 0;
  element.style.transitionDuration = `${duration}ms`;
  previous.style.transitionDuration = `${duration}ms`;
  // Flush the layout so the browser animates from opacity 0 rather than
  // collapsing both style changes into one frame.
  void element.offsetWidth;

  element.classList.add('visible');
  previous.classList.remove('visible');

  const retired = visible;
  visible = target;

  if (retireHandle !== null) window.clearTimeout(retireHandle);
  retireHandle = window.setTimeout(() => {
    retireHandle = null;
    // Only release if that layer has not been reused in the meantime.
    if (visible !== retired) retire(retired);
  }, duration + 60);

  await emit(EVENT_RESULT, { token, ok: true });
}

function clear(): void {
  latestToken += 1;
  if (retireHandle !== null) {
    window.clearTimeout(retireHandle);
    retireHandle = null;
  }
  for (const layer of ['a', 'b'] as Layer[]) {
    layers[layer].style.transitionDuration = '0ms';
    layers[layer].classList.remove('visible');
    retire(layer);
  }
  layers.a.classList.add('visible');
  visible = 'a';
}

// The presentation window holds focus while a show is running, so these keys
// have to be forwarded from here for Previous/Next/Stop to work at all. They are
// ordinary window listeners, not global shortcuts: nothing is intercepted from
// any other application.
window.addEventListener('keydown', (event) => {
  const keys = ['ArrowLeft', 'ArrowRight', ' ', 'Escape'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  void emit(EVENT_KEY, { key: event.key });
});

// Swallow the context menu; nothing but images belongs on this screen.
window.addEventListener('contextmenu', (event) => event.preventDefault());

let showQueue: Promise<void> = Promise.resolve();

async function main(): Promise<void> {
  await listen<ShowRequest>(EVENT_SHOW, (event) => {
    // Serialise so two rapid requests cannot interleave their layer swaps.
    showQueue = showQueue.then(() => show(event.payload)).catch(() => undefined);
  });
  await listen(EVENT_CLEAR, () => clear());
  // Tells the controller the listeners are attached and it is safe to send the
  // first image.
  await emit(EVENT_READY, {});
}

void main();
