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
import {
  EVENT_BOARD,
  EVENT_CLEAR,
  EVENT_KEY,
  EVENT_LAYOUT,
  EVENT_READY,
  EVENT_RESULT,
  EVENT_SHOW,
  EVENT_TAKEOVER,
  EVENT_TAKEOVER_END,
} from './app/events.js';
import type { BoardMessage, LayoutMessage, ShowRequest, TakeoverRequest } from './app/events.js';

type Layer = 'a' | 'b';

const layers: Record<Layer, HTMLImageElement> = {
  a: document.getElementById('layer-a') as HTMLImageElement,
  b: document.getElementById('layer-b') as HTMLImageElement,
};

const takeover = {
  root: document.getElementById('takeover') as HTMLDivElement,
  jersey: document.getElementById('takeover-jersey') as HTMLDivElement,
  position: document.getElementById('takeover-position') as HTMLParagraphElement,
  name: document.getElementById('takeover-name') as HTMLParagraphElement,
  stats: document.getElementById('takeover-stats') as HTMLUListElement,
};

const board = document.getElementById('board') as HTMLTableElement;

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

/**
 * Switch between the full-screen and split layouts.
 *
 * Only a class on `<body>`; the image layers are positioned inside their pane
 * either way, so nothing about decoding or the crossfade changes.
 */
function setLayout(message: LayoutMessage): void {
  document.body.classList.toggle('split', message.layout === 'split');
}

/**
 * Redraw the on-court board.
 *
 * A full redraw of six rows costs nothing and cannot drift out of step with the
 * roster, which a partial update could.
 */
function setBoard(message: BoardMessage): void {
  board.replaceChildren();

  if (message.rows.length === 0) {
    // Something calm, never an error: this screen only ever carries content.
    const body = document.createElement('tbody');
    const row = document.createElement('tr');
    row.className = 'board-empty-row';
    const cell = document.createElement('td');
    cell.className = 'board-empty';
    cell.colSpan = 6;
    cell.textContent = 'No lineup set';
    row.append(cell);
    body.append(row);
    board.append(body);
    return;
  }

  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  // The two identity columns need no visible heading; the four figures do, and
  // the full word rides along in a title for anyone reading it up close.
  const headings: [string, string, string][] = [
    ['number', '', ''],
    ['name', '', ''],
    ['figure', 'K', 'Kills'],
    ['figure', 'A', 'Assists'],
    ['figure', 'D', 'Digs'],
    ['figure', 'B', 'Blocks'],
  ];
  for (const [kind, label, full] of headings) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.className = `board-head ${kind}`;
    cell.textContent = label;
    if (full !== '') cell.title = full;
    headRow.append(cell);
  }
  head.append(headRow);
  board.append(head);

  const body = document.createElement('tbody');
  for (const row of message.rows) {
    const tr = document.createElement('tr');
    const cells: [string, string][] = [
      ['number', row.number],
      ['name', row.name],
      ['figure', row.kills],
      ['figure', row.assists],
      ['figure', row.digs],
      ['figure', row.blocks],
    ];
    for (const [kind, text] of cells) {
      const td = document.createElement('td');
      td.className = `board-cell ${kind}`;
      td.textContent = text;
      tr.append(td);
    }
    body.append(tr);
  }
  board.append(body);
}

/**
 * Sweep a player card over the images.
 *
 * The image layers are left exactly as they are underneath: the card is a
 * sibling that covers them, so when it sweeps away the show is still on the same
 * image with the same timer state. Nothing here computes a statistic — the
 * controller sends finished strings, so there is one implementation of the
 * box-score rules rather than two that can disagree.
 */
function showTakeover(request: TakeoverRequest): void {
  takeover.jersey.textContent = request.number;
  takeover.position.textContent = request.position;
  takeover.name.textContent = request.name;

  takeover.stats.replaceChildren();
  for (const stat of request.stats) {
    const item = document.createElement('li');
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = stat.value;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = stat.label;
    // `column-reverse` puts the value on top; the label comes first in the DOM
    // so a screen reader hears "Kills, 12".
    item.append(label, value);
    takeover.stats.append(item);
  }

  takeover.root.style.setProperty('--sweep-ms', `${request.sweepMs}ms`);
  // Restart the animation even if a card is already showing, so clicking a
  // second player swaps the card rather than doing nothing.
  takeover.root.classList.remove('sweep-in', 'sweep-out');
  void takeover.root.offsetWidth;
  takeover.root.classList.add('active', 'sweep-in');
}

/** Sweep the card away, leaving the images exactly as they were. */
function endTakeover(): void {
  if (!takeover.root.classList.contains('active')) return;
  takeover.root.classList.remove('sweep-in');
  takeover.root.classList.add('sweep-out');

  const done = () => {
    takeover.root.classList.remove('active', 'sweep-out');
    // Release the text so nothing lingers in the DOM between cards.
    takeover.jersey.textContent = '';
    takeover.position.textContent = '';
    takeover.name.textContent = '';
    takeover.stats.replaceChildren();
  };

  // `animationend` is the accurate signal; the timeout is the guarantee, since a
  // dropped animation event must never leave a card stuck over the show.
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(guard);
    takeover.root.removeEventListener('animationend', onEnd);
    done();
  };
  const onEnd = (event: AnimationEvent) => {
    if (event.target === takeover.root.firstElementChild) finish();
  };
  const guard = window.setTimeout(finish, 1200);
  takeover.root.addEventListener('animationend', onEnd);
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

  // A stopped show must not leave a card on the screen.
  takeover.root.classList.remove('active', 'sweep-in', 'sweep-out');
  takeover.jersey.textContent = '';
  takeover.position.textContent = '';
  takeover.name.textContent = '';
  takeover.stats.replaceChildren();
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
  await listen<LayoutMessage>(EVENT_LAYOUT, (event) => setLayout(event.payload));
  await listen<BoardMessage>(EVENT_BOARD, (event) => setBoard(event.payload));
  await listen<TakeoverRequest>(EVENT_TAKEOVER, (event) => showTakeover(event.payload));
  await listen(EVENT_TAKEOVER_END, () => endTakeover());
  // Tells the controller the listeners are attached and it is safe to send the
  // first image.
  await emit(EVENT_READY, {});
}

void main();
