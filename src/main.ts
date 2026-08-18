/**
 * The Picta controller.
 *
 * Wires the one small window: build a show, pick a display, start. Everything
 * with rules worth testing lives in `src/core`; everything native lives in
 * `src/app/ipc.ts`. What is left here is presentation of state.
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import { message as messageDialog } from '@tauri-apps/plugin-dialog';

import { EVENT_MENU } from './app/events.js';
import * as ipc from './app/ipc.js';
import { Playback, type StopReason } from './app/playback.js';
import { emptyPrefs, readPrefs, writePrefs, flushPrefs, type Prefs } from './app/prefs.js';
import { renderThumbs } from './app/thumbs.js';
import {
  chooseFolder,
  chooseImages,
  choosePictaToOpen,
  choosePictaToSave,
  directoryOf,
  openDocument,
  refreshImages,
  saveDocument,
} from './app/document-io.js';

import {
  newDocument,
  appendImages,
  missingImages,
  windowTitle,
  type DocumentState,
} from './core/document.js';
import {
  describeDisplay,
  displayLabel,
  findById,
  hintFor,
  matchDisplay,
  topologyEquals,
  type DisplayInfo,
} from './core/monitors.js';
import { moveItem } from './core/playlist.js';
import { basename, type PathStyle } from './core/paths.js';
import {
  UPDATE_CHECK_INTERVAL_MS,
  shouldCheckNow,
  shouldNotify,
  updateNoticeText,
  type UpdateStatus,
} from './core/update.js';
import { applyRelink, planRelink } from './core/relink.js';
import {
  INTERVAL_CHOICES,
  isImageSizing,
  isSupportedImagePath,
  isTransition,
  isValidInterval,
  type ImageItem,
} from './core/types.js';

// --- element lookup ---------------------------------------------------------

function need<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing element: ${id}`);
  return element as T;
}

const ui = {
  setup: need<HTMLDivElement>('setup'),
  running: need<HTMLDivElement>('running'),
  dropzone: need<HTMLButtonElement>('dropzone'),
  thumbs: need<HTMLUListElement>('thumbs'),
  imageCount: need<HTMLParagraphElement>('image-count'),
  clearImages: need<HTMLButtonElement>('clear-images'),
  missingNotice: need<HTMLDivElement>('missing-notice'),
  missingText: need<HTMLParagraphElement>('missing-text'),
  locateImages: need<HTMLButtonElement>('locate-images'),
  removeMissing: need<HTMLButtonElement>('remove-missing'),
  displaySelect: need<HTMLSelectElement>('display-select'),
  displayDetail: need<HTMLParagraphElement>('display-detail'),
  identify: need<HTMLButtonElement>('identify'),
  intervalSelect: need<HTMLSelectElement>('interval-select'),
  transitionSelect: need<HTMLSelectElement>('transition-select'),
  sizingSelect: need<HTMLSelectElement>('sizing-select'),
  start: need<HTMLButtonElement>('start'),
  runningDisplay: need<HTMLSpanElement>('running-display'),
  runningDetail: need<HTMLParagraphElement>('running-detail'),
  runningPosition: need<HTMLParagraphElement>('running-position'),
  previous: need<HTMLButtonElement>('previous'),
  next: need<HTMLButtonElement>('next'),
  stop: need<HTMLButtonElement>('stop'),
  message: need<HTMLParagraphElement>('message'),
  resume: need<HTMLButtonElement>('resume'),
  confirmDialog: need<HTMLDialogElement>('confirm-dialog'),
  confirmText: need<HTMLParagraphElement>('confirm-text'),
  updateNotice: need<HTMLDivElement>('update-notice'),
  updateText: need<HTMLParagraphElement>('update-text'),
  updateOpen: need<HTMLButtonElement>('update-open'),
  updateDismiss: need<HTMLButtonElement>('update-dismiss'),
};

// --- state ------------------------------------------------------------------

let style: PathStyle = 'posix';
let doc: DocumentState = newDocument();
let prefs: Prefs = { ...emptyPrefs };
let displays: DisplayInfo[] = [];
let selectedDisplayId: string | null = null;
/** Set when a run ended because its output display vanished. */
let lostDisplayHint: Prefs['displayHint'] = null;
let watchHandle: number | null = null;
let busy = false;
/** The version currently named in the update notice, if one is showing. */
let noticedVersion: string | null = null;
let updateCheckHandle: number | null = null;

const appWindow = getCurrentWindow();

const playback = new Playback({
  onPosition: (position, total) => {
    ui.runningPosition.textContent = `Image ${position} of ${total}`;
  },
  onStopped: (reason) => void handleStopped(reason),
  onKey: (key) => handleShortcut(key),
});

// --- rendering --------------------------------------------------------------

function setMessage(text: string | null): void {
  ui.message.textContent = text ?? '';
  ui.message.hidden = text === null;
}

function markDirty(): void {
  doc.dirty = true;
  void appWindow.setTitle(windowTitle(doc));
}

function markClean(): void {
  doc.dirty = false;
  void appWindow.setTitle(windowTitle(doc));
}

function renderImages(): void {
  const images = doc.data.images;
  ui.dropzone.classList.toggle('compact', images.length > 0);
  ui.clearImages.hidden = images.length === 0;

  const missingCount = images.filter((image) => image.missing).length;
  const usable = images.length - missingCount;
  ui.imageCount.textContent =
    images.length === 0 ? 'No images' : `${images.length} image${images.length === 1 ? '' : 's'}`;

  renderThumbs(ui.thumbs, images, style, {
    onRemove: (index) => {
      doc.data.images = images.filter((_, i) => i !== index);
      markDirty();
      renderImages();
    },
    onReorder: (from, to) => {
      doc.data.images = moveItem(images, from, to);
      markDirty();
      renderImages();
    },
  });

  if (missingCount > 0) {
    ui.missingNotice.hidden = false;
    ui.missingText.textContent =
      missingCount === 1
        ? "1 image couldn't be found."
        : `${missingCount} images couldn't be found.`;
  } else {
    ui.missingNotice.hidden = true;
  }

  ui.start.disabled = usable === 0 || selectedDisplayId === null;
}

function renderDisplays(): void {
  const previous = selectedDisplayId;
  ui.displaySelect.replaceChildren();

  if (displays.length === 0) {
    const option = document.createElement('option');
    option.textContent = 'No displays found';
    option.value = '';
    ui.displaySelect.append(option);
    ui.displaySelect.disabled = true;
    selectedDisplayId = null;
    ui.displayDetail.textContent = '';
    ui.start.disabled = true;
    return;
  }

  ui.displaySelect.disabled = false;
  for (const display of displays) {
    const option = document.createElement('option');
    option.value = display.id;
    option.textContent = `${displayLabel(display)} — ${describeDisplay(display)}`;
    ui.displaySelect.append(option);
  }

  const stillThere = previous !== null && displays.some((d) => d.id === previous);
  if (!stillThere) {
    // Only pre-select from the saved hint when the match is unambiguous.
    // Anything less and the operator picks, because guessing here is how a show
    // ends up on the wrong screen.
    const match = matchDisplay(prefs.displayHint, displays);
    selectedDisplayId = match.confidence === 'exact' && match.display ? match.display.id : null;
  }

  if (selectedDisplayId === null) {
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = 'Choose output display';
    ui.displaySelect.prepend(prompt);
    ui.displaySelect.value = '';
    ui.displayDetail.textContent = '';
  } else {
    ui.displaySelect.value = selectedDisplayId;
    const display = findById(displays, selectedDisplayId);
    ui.displayDetail.textContent = display ? describeDisplay(display) : '';
  }

  renderImages();
}

function renderSettings(): void {
  ui.intervalSelect.replaceChildren();
  const choices = new Set<number>([...INTERVAL_CHOICES, doc.data.intervalSeconds]);
  for (const seconds of [...choices].sort((a, b) => a - b)) {
    const option = document.createElement('option');
    option.value = String(seconds);
    option.textContent = seconds === 1 ? '1 second' : `${seconds} seconds`;
    ui.intervalSelect.append(option);
  }
  ui.intervalSelect.value = String(doc.data.intervalSeconds);
  ui.transitionSelect.value = doc.data.transition;
  ui.sizingSelect.value = doc.data.imageSizing;
}

function renderMode(): void {
  const running = playback.active;
  ui.setup.hidden = running;
  ui.running.hidden = !running;
}

// --- images -----------------------------------------------------------------

async function addImages(paths: string[]): Promise<void> {
  const supported = paths.filter((path) => isSupportedImagePath(path));
  const rejected = paths.length - supported.length;
  if (supported.length === 0) {
    if (rejected > 0) setMessage('Picta supports PNG, JPEG and WebP images only.');
    return;
  }

  const before = doc.data.images.length;
  const merged = appendImages(doc.data.images, supported);
  doc.data.images = await refreshImages(merged);
  if (doc.data.images.length !== before) markDirty();

  const first = supported[0];
  if (first) rememberDirectory(directoryOf(first, style));

  setMessage(rejected > 0 ? 'Some files were skipped: Picta supports PNG, JPEG and WebP.' : null);
  renderImages();
}

function rememberDirectory(directory: string): void {
  prefs = { ...prefs, lastDirectory: directory };
  writePrefs(prefs);
}

async function locateImages(): Promise<void> {
  const missing = missingImages(doc.data.images);
  if (missing.length === 0) return;

  const folder = await chooseFolder(prefs.lastDirectory);
  if (folder === null) return;

  // One folder can explain every missing file, so try them all against it
  // before asking again.
  const plans = planRelink(missing, folder, style);
  const candidates = [...new Set(plans.flatMap((plan) => plan.candidates))];
  const existence = await ipc.pathsExist(candidates);
  const present = new Set(candidates.filter((_, index) => existence[index] === true));

  const resolved = applyRelink(plans, (path) => present.has(path));
  if (resolved.length === 0) {
    setMessage(`No missing images were found in ${basename(folder, style)}.`);
    return;
  }

  const images = doc.data.images.slice();
  for (const entry of resolved) {
    const existing = images[entry.index];
    if (existing) images[entry.index] = { path: entry.path, missing: false };
  }
  doc.data.images = await refreshImages(images);
  markDirty();
  rememberDirectory(folder);

  const remaining = doc.data.images.filter((image) => image.missing).length;
  setMessage(
    remaining === 0
      ? `Relinked ${resolved.length} image${resolved.length === 1 ? '' : 's'}.`
      : `Relinked ${resolved.length}. ${remaining} still missing.`,
  );
  renderImages();
}

function removeMissing(): void {
  const before = doc.data.images.length;
  doc.data.images = doc.data.images.filter((image) => !image.missing);
  if (doc.data.images.length !== before) markDirty();
  setMessage(null);
  renderImages();
}

// --- documents --------------------------------------------------------------

type SaveChoice = 'save' | 'discard' | 'cancel';

function askSaveChanges(): Promise<SaveChoice> {
  const name = doc.filePath ? basename(doc.filePath, style) : 'this show';
  ui.confirmText.textContent = `Save changes to ${name} before continuing?`;
  ui.confirmDialog.returnValue = 'cancel';
  ui.confirmDialog.showModal();
  return new Promise((resolve) => {
    ui.confirmDialog.addEventListener(
      'close',
      () => {
        const value = ui.confirmDialog.returnValue;
        resolve(value === 'save' || value === 'discard' ? value : 'cancel');
      },
      { once: true },
    );
  });
}

/** Returns false when the operator cancelled and the action must not proceed. */
async function ensureSaved(): Promise<boolean> {
  if (!doc.dirty) return true;
  const choice = await askSaveChanges();
  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;
  return save();
}

async function save(): Promise<boolean> {
  if (doc.filePath === null) return saveAs();
  const result = await saveDocument(doc.filePath, doc.data, style);
  if (!result.ok) {
    await messageDialog(result.message, { title: 'Picta', kind: 'error' });
    return false;
  }
  markClean();
  setMessage(null);
  return true;
}

async function saveAs(): Promise<boolean> {
  const suggested = doc.filePath ? basename(doc.filePath, style) : 'Untitled.picta';
  const path = await choosePictaToSave(prefs.lastDirectory, suggested);
  if (path === null) return false;
  const result = await saveDocument(path, doc.data, style);
  if (!result.ok) {
    await messageDialog(result.message, { title: 'Picta', kind: 'error' });
    return false;
  }
  doc.filePath = path;
  markClean();
  rememberDirectory(directoryOf(path, style));
  setMessage(null);
  return true;
}

async function newShow(): Promise<void> {
  if (!(await ensureSaved())) return;
  doc = newDocument();
  markClean();
  setMessage(null);
  renderSettings();
  renderImages();
}

async function openShow(path?: string): Promise<void> {
  if (!(await ensureSaved())) return;
  const target = path ?? (await choosePictaToOpen(prefs.lastDirectory));
  if (target === null || target === undefined) return;

  const outcome = await openDocument(target, style);
  if (!outcome.ok) {
    await messageDialog(outcome.message, { title: 'Picta', kind: 'error' });
    return;
  }

  doc = { filePath: outcome.filePath, data: outcome.data, dirty: false };
  markClean();
  rememberDirectory(directoryOf(outcome.filePath, style));
  setMessage(null);
  renderSettings();
  renderImages();
}

// --- displays ---------------------------------------------------------------

async function refreshDisplays(): Promise<DisplayInfo[]> {
  try {
    const next = await ipc.listDisplays();
    if (!topologyEquals(next, displays)) {
      displays = next;
      if (!playback.active) renderDisplays();
    }
    return next;
  } catch {
    return displays;
  }
}

/**
 * While a show is running, watch for the output display disappearing. Index
 * positions shift the moment anything is unplugged, so the check is by identity
 * and the response is to stop — never to move the show somewhere else.
 */
function startWatching(): void {
  stopWatching();
  watchHandle = window.setInterval(() => void watchTick(), playback.active ? 1500 : 5000);
}

function stopWatching(): void {
  if (watchHandle !== null) {
    window.clearInterval(watchHandle);
    watchHandle = null;
  }
}

async function watchTick(): Promise<void> {
  const next = await refreshDisplays();

  if (playback.active) {
    const stillThere = selectedDisplayId !== null && next.some((d) => d.id === selectedDisplayId);
    if (!stillThere) await outputLost();
    return;
  }

  if (lostDisplayHint) {
    const match = matchDisplay(lostDisplayHint, next);
    ui.resume.hidden = !(match.confidence === 'exact' && match.display !== null);
  }
}

/** The output display vanished mid-show. Stop; never relocate the output. */
async function outputLost(): Promise<void> {
  lostDisplayHint = prefs.displayHint;
  playback.abandon();
  await ipc.closePresentation().catch(() => undefined);
  renderMode();
  startWatching();
  selectedDisplayId = null;
  renderDisplays();
  setMessage('Output display disconnected.\n\nChoose a display to continue.');
}

// --- running ----------------------------------------------------------------

async function start(): Promise<void> {
  if (busy) return;
  const usable = doc.data.images.filter((image) => !image.missing);
  if (usable.length === 0) {
    setMessage('Add at least one image that Picta can find.');
    return;
  }
  if (selectedDisplayId === null) {
    setMessage('Choose a display first.');
    return;
  }

  busy = true;
  ui.start.disabled = true;
  try {
    // Re-enumerate first: the chosen display may have gone since the list was
    // drawn, and starting on a stale index is exactly the failure to avoid.
    const current = await refreshDisplays();
    const display = findById(current, selectedDisplayId);
    if (!display) {
      setMessage('That display is no longer connected. Choose a display to continue.');
      renderDisplays();
      return;
    }

    // Refresh existence so a file deleted since it was added never reaches the
    // presentation, and re-grant asset access for the survivors.
    doc.data.images = await refreshImages(doc.data.images);
    renderImages();
    if (doc.data.images.every((image) => image.missing)) {
      setMessage('None of these images could be found.');
      return;
    }

    playback.resetReady();
    let placed: DisplayInfo;
    try {
      placed = await ipc.openPresentation(display.id);
    } catch (error) {
      setMessage(String(error));
      return;
    }

    prefs = { ...prefs, displayHint: hintFor(placed) };
    writePrefs(prefs);
    lostDisplayHint = null;
    ui.resume.hidden = true;

    ui.runningDisplay.textContent = `Running on ${displayLabel(placed)}`;
    ui.runningDetail.textContent = describeDisplay(placed);
    ui.runningPosition.textContent = 'Starting…';
    setMessage(null);
    renderMode();

    const began = await playback.begin(doc.data.images, {
      intervalSeconds: doc.data.intervalSeconds,
      transition: doc.data.transition,
      imageSizing: doc.data.imageSizing,
    });
    if (!began) return;
    startWatching();
  } finally {
    busy = false;
    renderMode();
    if (!playback.active) renderImages();
  }
}

async function handleStopped(reason: StopReason): Promise<void> {
  await ipc.closePresentation().catch(() => undefined);
  renderMode();
  startWatching();
  renderImages();
  void appWindow.setFocus();

  if (reason === 'exhausted') {
    setMessage('Playback stopped: no images could be displayed.');
  } else if (reason === 'display-lost') {
    setMessage('Output display disconnected.\n\nChoose a display to continue.');
  }
}

async function resume(): Promise<void> {
  const match = matchDisplay(lostDisplayHint, displays);
  if (match.confidence !== 'exact' || !match.display) {
    setMessage('That display could not be identified with confidence. Choose a display.');
    ui.resume.hidden = true;
    return;
  }
  selectedDisplayId = match.display.id;
  renderDisplays();
  ui.resume.hidden = true;
  await start();
}

// --- updates ----------------------------------------------------------------

/**
 * Tell the operator when a newer Picta exists. Picta never downloads or
 * installs anything: on a machine that boots from a USB stick in a booth,
 * silently swapping the executable is not a favour. `Not Now` silences this
 * version only, so the next release is still announced.
 */
function showUpdateNotice(status: UpdateStatus): void {
  noticedVersion = status.latestVersion;
  ui.updateText.textContent = updateNoticeText(status);
  ui.updateNotice.hidden = false;
}

function hideUpdateNotice(): void {
  noticedVersion = null;
  ui.updateNotice.hidden = true;
}

async function runUpdateCheck(manual: boolean): Promise<void> {
  if (!manual && !shouldCheckNow(updateState(), Date.now(), { running: playback.active })) {
    return;
  }

  const status = await ipc.checkForUpdate();
  // Record the attempt either way, so a machine behind a firewall does not
  // retry on every single poll.
  prefs = { ...prefs, lastUpdateCheck: Date.now() };
  writePrefs(prefs);

  if (status === null) {
    if (manual) setMessage('Could not check for updates. Picta works fine offline.');
    return;
  }

  // A manual check reports whatever it found, including good news; an automatic
  // one stays silent unless there is something new.
  if (shouldNotify(status, manual ? null : prefs.dismissedVersion)) {
    showUpdateNotice(status);
  } else if (manual) {
    setMessage(`Picta ${status.currentVersion} is up to date.`);
  }
}

function updateState() {
  return {
    enabled: prefs.updateChecks,
    lastCheck: prefs.lastUpdateCheck,
    dismissedVersion: prefs.dismissedVersion,
  };
}

/**
 * Re-examine whether a check is due. This is a plain hourly timer rather than
 * anything clever: `shouldCheckNow` owns the once-a-day rule, and it refuses
 * while a show is running, so the check simply happens at the next opportunity.
 */
function startUpdateSchedule(): void {
  if (updateCheckHandle !== null) return;
  updateCheckHandle = window.setInterval(
    () => void runUpdateCheck(false),
    Math.min(UPDATE_CHECK_INTERVAL_MS, 60 * 60 * 1000),
  );
}

// --- keyboard ---------------------------------------------------------------

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    tag === 'BUTTON' ||
    target.isContentEditable
  );
}

function handleShortcut(key: string): void {
  if (!playback.active) return;
  if (key === 'ArrowLeft') playback.previous();
  else if (key === 'ArrowRight' || key === ' ') playback.next();
  else if (key === 'Escape') playback.stop('user');
}

// --- startup ----------------------------------------------------------------

function wire(): void {
  ui.dropzone.addEventListener('click', async () => {
    const paths = await chooseImages(prefs.lastDirectory);
    if (paths.length > 0) await addImages(paths);
  });

  ui.clearImages.addEventListener('click', () => {
    if (doc.data.images.length === 0) return;
    doc.data.images = [];
    markDirty();
    setMessage(null);
    renderImages();
  });

  ui.locateImages.addEventListener('click', () => void locateImages());
  ui.removeMissing.addEventListener('click', () => removeMissing());

  ui.displaySelect.addEventListener('change', () => {
    selectedDisplayId = ui.displaySelect.value === '' ? null : ui.displaySelect.value;
    const display = findById(displays, selectedDisplayId);
    ui.displayDetail.textContent = display ? describeDisplay(display) : '';
    if (display) {
      // Selecting a display is a machine preference, not a document change.
      prefs = { ...prefs, displayHint: hintFor(display) };
      writePrefs(prefs);
    }
    setMessage(null);
    renderImages();
  });

  ui.identify.addEventListener('click', async () => {
    try {
      await ipc.identifyDisplays();
    } catch (error) {
      setMessage(String(error));
    }
  });

  ui.intervalSelect.addEventListener('change', () => {
    const seconds = Number(ui.intervalSelect.value);
    if (!isValidInterval(seconds)) return;
    doc.data.intervalSeconds = seconds;
    markDirty();
  });

  ui.transitionSelect.addEventListener('change', () => {
    const value = ui.transitionSelect.value;
    if (!isTransition(value)) return;
    doc.data.transition = value;
    markDirty();
  });

  ui.sizingSelect.addEventListener('change', () => {
    const value = ui.sizingSelect.value;
    if (!isImageSizing(value)) return;
    doc.data.imageSizing = value;
    markDirty();
  });

  ui.start.addEventListener('click', () => void start());
  ui.stop.addEventListener('click', () => playback.stop('user'));
  ui.previous.addEventListener('click', () => playback.previous());
  ui.next.addEventListener('click', () => playback.next());
  ui.resume.addEventListener('click', () => void resume());

  ui.updateOpen.addEventListener('click', () => {
    void ipc.openReleasesPage().catch(() => {
      setMessage('Could not open the browser. Visit github.com/gbyo/picta/releases.');
    });
  });

  ui.updateDismiss.addEventListener('click', () => {
    if (noticedVersion !== null) {
      prefs = { ...prefs, dismissedVersion: noticedVersion };
      writePrefs(prefs);
    }
    hideUpdateNotice();
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (ui.confirmDialog.open) return;
    // Never hijack a key meant for a control the operator is using.
    if (isTypingTarget(event.target)) return;
    if (!playback.active) return;
    if (['ArrowLeft', 'ArrowRight', ' ', 'Escape'].includes(event.key)) {
      event.preventDefault();
      handleShortcut(event.key);
    }
  });

  // Native OS file drop. Enabled on this window only.
  void getCurrentWebviewWindow().onDragDropEvent((event) => {
    if (playback.active) return;
    if (event.payload.type === 'over') {
      ui.dropzone.classList.add('over');
    } else if (event.payload.type === 'drop') {
      ui.dropzone.classList.remove('over');
      void addImages(event.payload.paths);
    } else {
      ui.dropzone.classList.remove('over');
    }
  });

  void listen<string>(EVENT_MENU, (event) => {
    switch (event.payload) {
      case 'new':
        void newShow();
        break;
      case 'open':
        void openShow();
        break;
      case 'save':
        void save();
        break;
      case 'save-as':
        void saveAs();
        break;
      case 'check-updates':
        setMessage('Checking for updates…');
        void runUpdateCheck(true);
        break;
      case 'update-checks-on':
        prefs = { ...prefs, updateChecks: true };
        writePrefs(prefs);
        void runUpdateCheck(false);
        break;
      case 'update-checks-off':
        prefs = { ...prefs, updateChecks: false };
        writePrefs(prefs);
        hideUpdateNotice();
        break;
      default:
        break;
    }
  });

  // A show must never outlive its controller, and unsaved work must never be
  // discarded silently.
  void appWindow.onCloseRequested(async (event) => {
    event.preventDefault();
    playback.stop('user');
    if (!(await ensureSaved())) return;
    await persistWindow();
    await ipc.closePresentation().catch(() => undefined);
    await ipc.quitApp().catch(() => undefined);
  });

  window.addEventListener('focus', () => void refreshDisplays());
}

async function persistWindow(): Promise<void> {
  try {
    const size = await appWindow.innerSize();
    const position = await appWindow.outerPosition();
    prefs = {
      ...prefs,
      window: { width: size.width, height: size.height, x: position.x, y: position.y },
    };
  } catch {
    // Geometry is a nicety; never block the quit path on it.
  }
  await flushPrefs(prefs);
}

async function restoreWindow(available: DisplayInfo[]): Promise<void> {
  const saved = prefs.window;
  if (!saved) return;
  try {
    const { PhysicalSize, PhysicalPosition } = await import('@tauri-apps/api/dpi');
    await appWindow.setSize(new PhysicalSize(saved.width, saved.height));
    // Only restore the position if the window would land on a display that is
    // actually attached; otherwise leave it centred where Tauri put it.
    const onScreen = available.some(
      (d) =>
        saved.x + 80 >= d.x &&
        saved.y + 40 >= d.y &&
        saved.x < d.x + d.width &&
        saved.y < d.y + d.height,
    );
    if (onScreen) await appWindow.setPosition(new PhysicalPosition(saved.x, saved.y));
  } catch {
    // Fall back to the configured default geometry.
  }
}

async function main(): Promise<void> {
  try {
    style = await ipc.pathStyle();
  } catch {
    style = navigator.userAgent.includes('Windows') ? 'win32' : 'posix';
  }

  prefs = await readPrefs();
  await playback.init();
  wire();

  displays = await ipc.listDisplays().catch(() => [] as DisplayInfo[]);
  await restoreWindow(displays);

  renderSettings();
  renderDisplays();
  renderImages();
  markClean();
  startWatching();

  // `Picta.exe Basketball.picta` — the same entry point an installed build
  // would use for a file association, without needing one.
  const startup = await ipc.startupFile().catch(() => null);
  if (startup) await openShow(startup);

  await appWindow.show();
  await appWindow.setFocus();

  // Last, and never blocking startup: whether a newer Picta exists matters far
  // less than the window being usable.
  startUpdateSchedule();
  void runUpdateCheck(false);
}

void main().catch((error: unknown) => {
  setMessage(`Picta could not start: ${String(error)}`);
  void appWindow.show();
});

// Keep the reference used so tree-shaking cannot drop the type-only import.
export type { ImageItem };
