/**
 * Dumb, event-driven output renderer.
 *
 * The controller decides what a cue means, which player is next, how stats are
 * calculated and when media advances.  This window only lays out zones and
 * renders the display-ready commands it receives.
 */

import { emit, listen } from '@tauri-apps/api/event';
import {
  EVENT_BACKGROUND,
  EVENT_BOARD,
  EVENT_CLEAR,
  EVENT_CUE,
  EVENT_CUE_END,
  EVENT_KEY,
  EVENT_LAYOUT,
  EVENT_PLAYBACK,
  EVENT_READY,
  EVENT_RESULT,
  EVENT_SHOW,
  EVENT_THEME,
  EVENT_TAKEOVER,
  EVENT_TAKEOVER_END,
  type BackgroundMediaMessage,
  type BoardMessage,
  type CueMessage,
  type LayoutMessage,
  type PlaybackEvent,
  type ShowRequest,
  type ThemeMessage,
  type TakeoverRequest,
} from './app/events.js';
import type { BoardData, Cue, LayoutNode, ZoneRole } from './core/domain.js';
import type { BoardRow as LegacyBoardRow } from './core/lineup.js';
import { legacyLayoutToTree } from './core/layouts.js';

type LayerName = 'a' | 'b';

interface ZoneRenderer {
  root: HTMLDivElement;
  role: ZoneRole;
  images: Record<LayerName, HTMLImageElement>;
  visible: LayerName;
  video: HTMLVideoElement | null;
  videoToken: number | null;
  board: HTMLElement | null;
  cueCard: HTMLElement | null;
}

const layoutRoot = document.getElementById('layout-root') as HTMLDivElement;
const fullCue = document.getElementById('full-cue') as HTMLDivElement;
let zones = new Map<string, ZoneRenderer>();
let latestToken = 0;
let retiredTimer: number | null = null;

function clearElementMedia(element: HTMLElement): void {
  for (const video of [...element.querySelectorAll('video')]) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
}

function other(layer: LayerName): LayerName {
  return layer === 'a' ? 'b' : 'a';
}

function setZoneMetrics(root: HTMLDivElement): void {
  const update = () => {
    const rect = root.getBoundingClientRect();
    root.style.setProperty('--zone-width', `${Math.max(1, rect.width)}px`);
    root.style.setProperty('--zone-height', `${Math.max(1, rect.height)}px`);
    root.style.setProperty('--zone-min', `${Math.max(1, Math.min(rect.width, rect.height))}px`);
    root.classList.toggle('wide', rect.width / Math.max(1, rect.height) > 2.3);
    root.classList.toggle('tall', rect.height / Math.max(1, rect.width) > 1.25);
  };
  update();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(root);
  else window.addEventListener('resize', update);
}

function createZone(id: string, role: ZoneRole): ZoneRenderer {
  const root = document.createElement('div');
  root.className = `layout-zone zone-${role}`;
  root.dataset['zoneId'] = id;
  const imageA = document.createElement('img');
  const imageB = document.createElement('img');
  for (const image of [imageA, imageB]) {
    image.className = 'media-layer fit';
    image.alt = '';
    image.decoding = 'async';
    image.setAttribute('aria-hidden', 'true');
  }
  imageA.classList.add('visible');
  root.append(imageA, imageB);
  const renderer: ZoneRenderer = {
    root,
    role,
    images: { a: imageA, b: imageB },
    visible: 'a',
    video: null,
    videoToken: null,
    board: null,
    cueCard: null,
  };
  if (role === 'live-board') {
    const shell = document.createElement('section');
    shell.className = 'board-shell';
    shell.setAttribute('aria-hidden', 'true');
    renderer.board = shell;
    root.append(shell);
  }
  setZoneMetrics(root);
  return renderer;
}

function createNode(node: LayoutNode): HTMLElement {
  if (node.type === 'zone') {
    const renderer = createZone(node.id, node.role);
    zones.set(node.id, renderer);
    return renderer.root;
  }
  const split = document.createElement('div');
  split.className = `layout-split ${node.direction}`;
  const first = document.createElement('div');
  const second = document.createElement('div');
  first.className = 'layout-child';
  second.className = 'layout-child';
  const ratio = Math.max(0.1, Math.min(0.9, node.ratio));
  first.style.flex = `${ratio} 1 0`;
  second.style.flex = `${1 - ratio} 1 0`;
  first.append(createNode(node.first));
  second.append(createNode(node.second));
  split.append(first, second);
  return split;
}

function setLayout(message: LayoutMessage): void {
  const incoming =
    typeof message.layout === 'string' ? legacyLayoutToTree(message.layout) : message.layout;
  for (const renderer of zones.values()) {
    stopVideo(renderer);
    for (const image of Object.values(renderer.images)) retireImage(image);
    renderer.cueCard?.remove();
    renderer.cueCard = null;
    renderer.board?.replaceChildren();
  }
  zones = new Map();
  layoutRoot.replaceChildren(createNode(incoming));
}

function setTheme(message: ThemeMessage): void {
  const background =
    message.background === 'primary'
      ? message.primary
      : message.background === 'secondary'
        ? message.secondary
        : '#000000';
  for (const element of [layoutRoot, fullCue]) {
    element.style.setProperty('--output-background', background);
    element.style.setProperty('--board-primary', message.primary);
    element.style.setProperty('--board-secondary', message.secondary);
    element.style.setProperty('--board-foreground', message.foreground);
    element.style.setProperty('--card-primary', message.primary);
    element.style.setProperty('--card-foreground', message.foreground);
    element.style.background = background;
  }
}

function retireImage(image: HTMLImageElement): void {
  image.removeAttribute('src');
  image.classList.remove('visible');
}

function stopVideo(renderer: ZoneRenderer): void {
  const video = renderer.video;
  if (!video) return;
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.remove();
  renderer.video = null;
  renderer.videoToken = null;
}

function sendResult(token: number, ok: boolean, zoneId?: string): void {
  void emit(EVENT_RESULT, { token, ok, ...(zoneId ? { zoneId } : {}) });
}

function sendPlayback(event: PlaybackEvent): void {
  void emit(EVENT_PLAYBACK, event);
}

async function showImage(request: BackgroundMediaMessage): Promise<void> {
  const renderer = zones.get(request.zoneId ?? 'program') ?? zones.get('program');
  if (!renderer) return;
  stopVideo(renderer);
  if (request.token < latestToken) return;
  latestToken = request.token;
  const target = other(renderer.visible);
  const image = renderer.images[target];
  const previous = renderer.images[renderer.visible];
  image.className = `media-layer ${request.sizing}`;
  image.style.transitionDuration = '0ms';
  image.src = request.src;
  try {
    await image.decode();
  } catch {
    retireImage(image);
    sendResult(request.token, false, request.zoneId);
    sendPlayback({
      token: request.token,
      event: 'failed',
      ok: false,
      ...(request.zoneId ? { zoneId: request.zoneId } : {}),
    });
    return;
  }
  if (request.token < latestToken) {
    retireImage(image);
    return;
  }
  const duration = request.transition === 'crossfade' ? request.fadeMs : 0;
  image.style.transitionDuration = `${duration}ms`;
  previous.style.transitionDuration = `${duration}ms`;
  void image.offsetWidth;
  image.classList.add('visible');
  previous.classList.remove('visible');
  const retired = renderer.visible;
  renderer.visible = target;
  if (retiredTimer !== null) window.clearTimeout(retiredTimer);
  retiredTimer = window.setTimeout(() => {
    retiredTimer = null;
    if (renderer.visible !== retired) retireImage(renderer.images[retired]);
  }, duration + 60);
  sendResult(request.token, true, request.zoneId);
  sendPlayback({
    token: request.token,
    event: 'ready',
    ok: true,
    ...(request.zoneId ? { zoneId: request.zoneId } : {}),
  });
}

function showVideo(request: BackgroundMediaMessage, fullTarget: HTMLElement | null = null): void {
  const renderer = fullTarget
    ? null
    : (zones.get(request.zoneId ?? 'program') ?? zones.get('program'));
  const host = fullTarget ?? renderer?.root;
  if (!host) return;
  if (renderer) {
    stopVideo(renderer);
    for (const image of Object.values(renderer.images)) retireImage(image);
  }
  const video = document.createElement('video');
  video.className = `video-layer ${request.sizing}`;
  video.muted = request.muted ?? renderer?.role !== 'program';
  video.autoplay = true;
  video.controls = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = request.src;
  host.append(video);
  if (renderer) {
    renderer.video = video;
    renderer.videoToken = request.token;
  }
  let finished = false;
  let readyTimer: number | null = null;
  const fail = () => {
    if (finished) return;
    finished = true;
    if (readyTimer !== null) window.clearTimeout(readyTimer);
    readyTimer = null;
    sendResult(request.token, false, request.zoneId);
    sendPlayback({
      token: request.token,
      event: 'failed',
      ok: false,
      ...(request.zoneId ? { zoneId: request.zoneId } : {}),
    });
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    if (renderer?.video === video) renderer.video = null;
  };
  readyTimer = window.setTimeout(() => fail(), 8000);
  video.addEventListener(
    'canplay',
    () => {
      if (finished) return;
      if (readyTimer !== null) window.clearTimeout(readyTimer);
      readyTimer = null;
      video.classList.add('visible');
      sendResult(request.token, true, request.zoneId);
      sendPlayback({
        token: request.token,
        event: 'ready',
        ok: true,
        ...(request.zoneId ? { zoneId: request.zoneId } : {}),
      });
      void video
        .play()
        .then(() =>
          sendPlayback({
            token: request.token,
            event: 'started',
            ok: true,
            ...(request.zoneId ? { zoneId: request.zoneId } : {}),
          }),
        )
        .catch(fail);
    },
    { once: true },
  );
  video.addEventListener('ended', () => {
    if (finished) return;
    finished = true;
    if (readyTimer !== null) window.clearTimeout(readyTimer);
    readyTimer = null;
    sendPlayback({
      token: request.token,
      event: 'ended',
      ok: true,
      ...(request.zoneId ? { zoneId: request.zoneId } : {}),
    });
  });
  video.addEventListener('error', fail, { once: true });
}

function renderBoard(renderer: ZoneRenderer, data: BoardData): void {
  const shell = renderer.board;
  if (!shell) return;
  shell.replaceChildren();
  const table = document.createElement('table');
  table.className = 'board-table';
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const [className, label] of [
    ['number', ''],
    ['name', ''],
    ...data.columns.map((column) => ['stat', column.shortLabel]),
  ] as [string, string][]) {
    const cell = document.createElement('th');
    cell.className = className;
    cell.textContent = label;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement('tbody');
  for (const row of data.rows) {
    const tr = document.createElement('tr');
    const cells: [string, string][] = [
      ['number', row.number],
      ['name', row.name],
      ...(row.values.map((value) => ['stat', value]) as [string, string][]),
    ];
    for (const [className, value] of cells) {
      const cell = document.createElement('td');
      cell.className = className;
      cell.textContent = value;
      tr.append(cell);
    }
    body.append(tr);
  }
  table.append(head, body);
  shell.append(table);
  if (data.rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'board-empty';
    empty.textContent = '';
    shell.append(empty);
  }
}

function legacyBoard(rows: LegacyBoardRow[]): BoardData {
  return {
    columns: [
      { id: 'kills', shortLabel: 'K', label: 'Kills' },
      { id: 'assists', shortLabel: 'A', label: 'Assists' },
      { id: 'digs', shortLabel: 'D', label: 'Digs' },
      { id: 'blocks', shortLabel: 'B', label: 'Blocks' },
    ],
    rows: rows.map((row, index) => ({
      playerId: `legacy-${index}`,
      number: row.number,
      name: row.name,
      values: [row.kills, row.assists, row.digs, row.blocks],
    })),
  };
}

function makeCard(cue: Extract<Cue, { type: 'player-card' }>, photoSrc?: string): HTMLElement {
  const card = document.createElement('section');
  card.className = 'player-card';
  if (!photoSrc) card.classList.add('no-photo');
  const number = document.createElement('p');
  number.className = 'player-number';
  number.textContent = cue.number ? `#${cue.number}` : '';
  const copy = document.createElement('div');
  copy.className = 'player-copy';
  const name = document.createElement('h1');
  name.className = 'player-name';
  name.textContent = cue.name;
  const position = document.createElement('p');
  position.className = 'player-position';
  position.textContent = cue.position;
  copy.append(name, position);
  const stats = document.createElement('div');
  stats.className = 'player-stats';
  for (const stat of cue.stats.slice(0, 4)) {
    const item = document.createElement('div');
    item.className = 'player-stat';
    const value = document.createElement('span');
    value.className = 'player-stat-value';
    value.textContent = stat.value;
    const label = document.createElement('span');
    label.className = 'player-stat-label';
    label.textContent = stat.label;
    item.append(value, label);
    stats.append(item);
  }
  if (photoSrc) {
    const photo = document.createElement('img');
    photo.className = 'player-photo';
    photo.alt = '';
    photo.src = photoSrc;
    photo.addEventListener('error', () => photo.remove(), { once: true });
    card.append(photo);
  }
  card.append(number, copy, stats);
  return card;
}

function applyCardMode(card: HTMLElement, host: HTMLElement): void {
  const rect = host.getBoundingClientRect();
  const ratio = rect.width / Math.max(1, rect.height);
  card.classList.toggle('wide', host.classList.contains('wide') || ratio > 2.3);
  card.classList.toggle(
    'tall',
    host.classList.contains('tall') || 1 / Math.max(ratio, 0.01) > 1.25,
  );
}

function renderCue(message: CueMessage): void {
  const cue = message.cue;
  if (cue.target === 'full-board') {
    for (const renderer of zones.values()) stopVideo(renderer);
  } else {
    const renderer = zones.get('program');
    if (renderer) stopVideo(renderer);
  }
  if (cue.type === 'player-card') {
    const card = makeCard(cue, message.photoSrc);
    applyCardMode(
      card,
      cue.target === 'full-board' ? fullCue : (zones.get('program')?.root ?? layoutRoot),
    );
    if (cue.target === 'full-board') {
      clearElementMedia(fullCue);
      fullCue.replaceChildren(card);
      fullCue.hidden = false;
    } else {
      const renderer = zones.get('program');
      if (!renderer) return;
      renderer.cueCard?.remove();
      renderer.cueCard = card;
      renderer.root.append(card);
    }
    return;
  }
  if (cue.type === 'image' && message.src) {
    const image = document.createElement('img');
    image.className = 'cue-image fit';
    image.alt = '';
    image.src = message.src;
    image.addEventListener('error', () => image.remove(), { once: true });
    if (cue.target === 'full-board') {
      clearElementMedia(fullCue);
      fullCue.replaceChildren(image);
      fullCue.hidden = false;
    } else {
      const renderer = zones.get('program');
      if (!renderer) return;
      renderer.cueCard?.remove();
      renderer.cueCard = image;
      renderer.root.append(image);
    }
    return;
  }
  if (cue.type === 'video' && message.src) {
    if (cue.target === 'full-board') {
      clearElementMedia(fullCue);
      fullCue.replaceChildren();
      fullCue.hidden = false;
      showVideo(
        {
          token: message.token ?? latestToken + 1,
          src: message.src,
          type: 'video',
          sizing: 'fit',
          transition: 'none',
          fadeMs: 0,
          muted: false,
        },
        fullCue,
      );
    } else {
      showVideo({
        token: message.token ?? latestToken + 1,
        src: message.src,
        type: 'video',
        sizing: 'fit',
        transition: 'none',
        fadeMs: 0,
        muted: false,
      });
    }
  }
}

function endCue(): void {
  fullCue.hidden = true;
  clearElementMedia(fullCue);
  fullCue.replaceChildren();
  for (const renderer of zones.values()) {
    renderer.cueCard?.remove();
    renderer.cueCard = null;
  }
}

function clear(): void {
  latestToken += 1;
  if (retiredTimer !== null) window.clearTimeout(retiredTimer);
  retiredTimer = null;
  for (const renderer of zones.values()) {
    stopVideo(renderer);
    for (const image of Object.values(renderer.images)) retireImage(image);
    renderer.cueCard?.remove();
    renderer.cueCard = null;
    renderer.board?.replaceChildren();
  }
  endCue();
}

let mediaQueue: Promise<void> = Promise.resolve();

function queueMedia(request: BackgroundMediaMessage): void {
  mediaQueue = mediaQueue
    .then(() =>
      request.type === 'video' ? (showVideo(request), Promise.resolve()) : showImage(request),
    )
    .catch(() => undefined);
}

window.addEventListener('keydown', (event) => {
  const keys = ['ArrowLeft', 'ArrowRight', ' ', 'Escape'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  void emit(EVENT_KEY, { key: event.key });
});

window.addEventListener('contextmenu', (event) => event.preventDefault());

async function main(): Promise<void> {
  await listen<ShowRequest>(EVENT_SHOW, (event) => queueMedia({ ...event.payload, type: 'image' }));
  await listen<BackgroundMediaMessage>(EVENT_BACKGROUND, (event) => queueMedia(event.payload));
  await listen(EVENT_CLEAR, () => clear());
  await listen<LayoutMessage>(EVENT_LAYOUT, (event) => setLayout(event.payload));
  await listen<ThemeMessage>(EVENT_THEME, (event) => setTheme(event.payload));
  await listen<BoardMessage>(EVENT_BOARD, (event) => {
    const data = event.payload.data ?? legacyBoard(event.payload.rows ?? []);
    const board = zones.get('live-board');
    if (board) renderBoard(board, data);
  });
  await listen<CueMessage>(EVENT_CUE, (event) => renderCue(event.payload));
  await listen(EVENT_CUE_END, () => endCue());
  // Compatibility with the v1 controller while the app migrates old shows.
  await listen<TakeoverRequest>(EVENT_TAKEOVER, (event) => {
    const request = event.payload;
    renderCue({
      cue: {
        type: 'player-card',
        playerId: `legacy-${request.number}-${request.name}`,
        target: 'program',
        holdMs: 9000,
        number: request.number,
        name: request.name,
        position: request.position,
        stats: request.stats,
      },
    });
  });
  await listen(EVENT_TAKEOVER_END, () => endCue());
  await emit(EVENT_READY, {});
}

void main();
