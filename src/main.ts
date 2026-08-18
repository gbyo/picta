/** Picta controller: a small desktop utility for media, optional teams and output. */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { message as messageDialog } from '@tauri-apps/plugin-dialog';
import * as ipc from './app/ipc.js';
import {
  EVENT_KEY,
  EVENT_MENU,
  type LayoutEditPreviewMessage,
  type ThemeMessage,
} from './app/events.js';
import { OutputController, type CueContext } from './app/output-controller.js';
import type { CueQueueState } from './core/cues.js';
import {
  askSceneName,
  confirmDeleteScene,
  renderScenePicker,
  renderSceneStrip,
} from './app/scenes-ui.js';
import { renderManualWorkspace } from './app/manual-presentation.js';
import { renderLayoutPreview, renderZoneSelect, type LayoutPath } from './app/layout-editor.js';
import { emptyPrefs, flushPrefs, readPrefs, writePrefs, type Prefs } from './app/prefs.js';
import {
  chooseMedia,
  chooseMediaSetToOpen,
  chooseMediaSetToSave,
  chooseTeamToOpen,
  chooseTeamToSave,
  openMediaSet,
  openTeam,
  saveMediaSet,
  saveTeam,
} from './app/resource-io.js';
import {
  chooseShowToOpen,
  chooseShowToSave,
  openShowDocument,
  saveShowDocument,
} from './app/show-io.js';
import {
  appendMedia,
  defaultMediaSet,
  isSupportedImagePath,
  isSupportedMediaPath,
  isSupportedVideoPath,
  mediaDurationSeconds,
  moveMediaItem,
} from './core/media.js';
import type {
  BoardData,
  Cue,
  LayoutNode,
  MediaItem,
  MediaSet,
  Player,
  Scene,
  ShowDocument,
  Team,
  ZoneRole,
} from './core/domain.js';
import {
  boardStatDefinitions,
  emptyRawStats,
  formatBoardData,
  getSportDefinition,
  makeCustomSport,
  recordStat,
  setRawStat,
} from './core/sports.js';
import {
  addPlayer,
  addPlayerToGroup,
  createTeam,
  makePlayer,
  removePlayer,
  removePlayerFromGroup,
  addGroup,
  makeGroup,
  removeGroup,
  reorderGroupPlayer,
  setLiveGroupPlayers,
  updatePlayer,
} from './core/teams.js';
import {
  describeDisplay,
  displayLabel,
  findById,
  hintFor,
  matchDisplay,
  topologyEquals,
  type DisplayInfo,
} from './core/monitors.js';
import { basename, dirname, type PathStyle } from './core/paths.js';
import {
  LAYOUT_PRESETS,
  layoutPreset,
  layoutPresetId,
  layoutPresetLabel,
  layoutZones,
  mergeZone,
  resolveZoneRects,
  setZoneRole,
  splitZone,
  updateSplitRatioAtPath,
  validateLayout,
  zoneRoleLabel,
} from './core/layouts.js';
import { cuesForPlayers, playerHasVideo } from './core/player-cues.js';
import { presentPlayer, type PresentationOutcome } from './core/player-presentation.js';
import {
  addScene,
  cloneScene,
  defaultSceneSet,
  moveScene,
  nextSceneId,
  renameScene,
  removeScene,
  replaceScene,
  sceneById,
  sceneNameTaken,
  setDefaultScene,
  type SceneSet,
} from './core/scenes.js';
import {
  beginManualGroup,
  cancelManualPlayer,
  finishManualPlayer,
  manualShownCount,
  startManualPlayer,
  undoManualPlayer,
  type ManualGroupSession,
} from './core/manual-group.js';
import {
  beginZoneEdit,
  cancelZoneEdit,
  commitZoneEdit,
  selectEditZone,
  setDraftLayout,
  setEditSafeAreas,
  type ZoneEditSession,
} from './core/zone-edit.js';
import { INTERVAL_CHOICES } from './core/types.js';
import { shouldCheckNow, shouldNotify, updateNoticeText } from './core/update.js';

function need<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing element: ${id}`);
  return element as T;
}

const ui = {
  globalStatus: need<HTMLParagraphElement>('global-status'),
  sceneStrip: need<HTMLElement>('scene-strip'),
  sceneButtons: need<HTMLDivElement>('scene-buttons'),
  scenePicker: need<HTMLDivElement>('scene-picker'),
  sceneCurrent: need<HTMLParagraphElement>('scene-current'),
  sceneHint: need<HTMLParagraphElement>('scene-hint'),
  sceneMenu: need<HTMLDetailsElement>('scene-menu'),
  sceneNew: need<HTMLButtonElement>('scene-new'),
  sceneDuplicate: need<HTMLButtonElement>('scene-duplicate'),
  sceneRename: need<HTMLButtonElement>('scene-rename'),
  sceneDelete: need<HTMLButtonElement>('scene-delete'),
  sceneDefault: need<HTMLButtonElement>('scene-default'),
  sceneMoveLeft: need<HTMLButtonElement>('scene-move-left'),
  sceneMoveRight: need<HTMLButtonElement>('scene-move-right'),
  sceneEdit: need<HTMLButtonElement>('scene-edit'),
  sceneDialog: need<HTMLDialogElement>('scene-dialog'),
  sceneDialogForm: need<HTMLFormElement>('scene-dialog-form'),
  sceneDialogTitle: need<HTMLElement>('scene-dialog-title'),
  sceneDialogName: need<HTMLInputElement>('scene-dialog-name'),
  sceneDialogError: need<HTMLParagraphElement>('scene-dialog-error'),
  sceneDialogConfirm: need<HTMLButtonElement>('scene-dialog-confirm'),
  sceneDeleteDialog: need<HTMLDialogElement>('scene-delete-dialog'),
  sceneDeleteText: need<HTMLParagraphElement>('scene-delete-text'),
  tabs: [
    need<HTMLButtonElement>('tab-media'),
    need<HTMLButtonElement>('tab-players'),
    need<HTMLButtonElement>('tab-output'),
  ],
  panels: [
    need<HTMLElement>('panel-media'),
    need<HTMLElement>('panel-players'),
    need<HTMLElement>('panel-output'),
  ],
  message: need<HTMLParagraphElement>('message'),
  mediaResourceName: need<HTMLParagraphElement>('media-resource-name'),
  mediaDropzone: need<HTMLButtonElement>('media-dropzone'),
  mediaList: need<HTMLDivElement>('media-list'),
  mediaCount: need<HTMLParagraphElement>('media-count'),
  mediaClear: need<HTMLButtonElement>('media-clear'),
  mediaMissing: need<HTMLDivElement>('media-missing'),
  mediaMissingText: need<HTMLParagraphElement>('media-missing-text'),
  mediaLocate: need<HTMLButtonElement>('media-locate'),
  mediaDuration: need<HTMLSelectElement>('media-duration'),
  mediaTransition: need<HTMLSelectElement>('media-transition'),
  mediaSizing: need<HTMLSelectElement>('media-sizing'),
  mediaPrevious: need<HTMLButtonElement>('media-previous'),
  mediaNext: need<HTMLButtonElement>('media-next'),
  noTeam: need<HTMLDivElement>('no-team'),
  teamLoaded: need<HTMLDivElement>('team-loaded'),
  teamName: need<HTMLElement>('team-name'),
  teamDetail: need<HTMLParagraphElement>('team-detail'),
  teamFileName: need<HTMLParagraphElement>('team-file-name'),
  customSportEditor: need<HTMLDivElement>('custom-sport-editor'),
  teamMenu: need<HTMLDetailsElement>('team-menu'),
  playerSubtabs: need<HTMLDivElement>('player-subtabs'),
  rosterViewTab: need<HTMLButtonElement>('roster-view-tab'),
  liveViewTab: need<HTMLButtonElement>('live-view-tab'),
  rosterView: need<HTMLDivElement>('roster-view'),
  rosterSetup: need<HTMLDivElement>('roster-setup'),
  liveView: need<HTMLDivElement>('live-view'),
  groupSelect: need<HTMLSelectElement>('group-select'),
  groupEditor: need<HTMLDivElement>('group-editor'),
  manualSession: need<HTMLElement>('manual-session'),
  manualTitle: need<HTMLElement>('manual-title'),
  manualCount: need<HTMLParagraphElement>('manual-count'),
  manualRows: need<HTMLDivElement>('manual-rows'),
  manualUndo: need<HTMLButtonElement>('manual-undo'),
  manualEnd: need<HTMLButtonElement>('manual-end'),
  rosterList: need<HTMLDivElement>('roster-list'),
  addPlayer: need<HTMLFormElement>('add-player'),
  newNumber: need<HTMLInputElement>('new-number'),
  newName: need<HTMLInputElement>('new-name'),
  newPosition: need<HTMLInputElement>('new-position'),
  playerInspector: need<HTMLElement>('player-inspector'),
  liveGroupSelect: need<HTMLSelectElement>('live-group-select'),
  liveTable: need<HTMLDivElement>('live-table'),
  displaySelect: need<HTMLSelectElement>('display-select'),
  displayDetail: need<HTMLParagraphElement>('display-detail'),
  identify: need<HTMLButtonElement>('identify'),
  layoutHeading: need<HTMLHeadingElement>('layout-heading'),
  layoutPresets: need<HTMLDivElement>('layout-presets'),
  layoutPreview: need<HTMLDivElement>('layout-preview'),
  layoutDetail: need<HTMLParagraphElement>('layout-detail'),
  layoutNormal: need<HTMLDivElement>('layout-normal'),
  customZoneSelect: need<HTMLSelectElement>('custom-zone-select'),
  customRoleSelect: need<HTMLSelectElement>('custom-role-select'),
  splitColumns: need<HTMLButtonElement>('split-columns'),
  splitRows: need<HTMLButtonElement>('split-rows'),
  mergeZone: need<HTMLButtonElement>('merge-zone'),
  zoneEditPanel: need<HTMLDivElement>('zone-edit-panel'),
  zoneEditCancel: need<HTMLButtonElement>('zone-edit-cancel'),
  zoneEditDone: need<HTMLButtonElement>('zone-edit-done'),
  zoneEditSafe: need<HTMLInputElement>('zone-edit-safe'),
  outputGroup: need<HTMLSelectElement>('output-group'),
  outputBackground: need<HTMLSelectElement>('output-background'),
  outputStart: need<HTMLButtonElement>('output-start'),
  outputStop: need<HTMLButtonElement>('output-stop'),
  cueControls: need<HTMLDivElement>('cue-controls'),
  cueStatus: need<HTMLParagraphElement>('cue-status'),
  cuePrevious: need<HTMLButtonElement>('cue-previous'),
  cueNext: need<HTMLButtonElement>('cue-next'),
  cueEnd: need<HTMLButtonElement>('cue-end'),
  confirmDialog: need<HTMLDialogElement>('confirm-dialog'),
  confirmText: need<HTMLParagraphElement>('confirm-text'),
  updateNotice: need<HTMLDivElement>('update-notice'),
  updateText: need<HTMLParagraphElement>('update-text'),
  updateOpen: need<HTMLButtonElement>('update-open'),
};

type TabName = 'media' | 'players' | 'output';
type PlayerView = 'roster' | 'live';
type SaveChoice = 'save' | 'discard' | 'cancel';

interface ShowState {
  filePath: string | null;
  data: ShowDocument;
  dirty: boolean;
}

function newShowData(): ShowDocument {
  const scenes = defaultSceneSet();
  return {
    version: 2,
    media: { kind: 'inline', data: defaultMediaSet('Inline Media') },
    event: { stats: {}, liveGroups: {} },
    ...scenes,
  };
}

let style: PathStyle = 'posix';
let prefs: Prefs = { ...emptyPrefs };
let show: ShowState = { filePath: null, data: newShowData(), dirty: false };
let mediaFilePath: string | null = null;
let mediaDirty = false;
let teamFilePath: string | null = null;
let teamDirty = false;
let activeTab: TabName = 'media';
let playerView: PlayerView = 'roster';
let selectedPlayerId: string | null = null;
let selectedRosterGroupId: string | null = null;
let selectedLiveGroupId: string | null = null;
let selectedSceneId: string | null = show.data.defaultSceneId;
let activeSceneId: string | null = null;
let zoneEditSession: ZoneEditSession | null = null;
let manualSession: ManualGroupSession | null = null;
let displays: DisplayInfo[] = [];
let selectedDisplayId: string | null = null;
let lostDisplayHint: Prefs['displayHint'] = null;
let watchHandle: number | null = null;
let busy = false;

const appWindow = getCurrentWindow();

function mediaSet(): MediaSet {
  const resource = show.data.media;
  return (
    resource.data ??
    defaultMediaSet(resource.kind === 'file' ? basename(resource.path, style) : 'Inline Media')
  );
}

function team(): Team | undefined {
  return show.data.team?.data;
}

function sceneSet(): SceneSet {
  return { scenes: show.data.scenes, defaultSceneId: show.data.defaultSceneId };
}

function selectedScene(): Scene {
  return (
    sceneById(show.data.scenes, selectedSceneId ?? show.data.defaultSceneId) ??
    show.data.scenes[0] ??
    defaultSceneSet().scenes[0]!
  );
}

function activeScene(): Scene {
  return (
    sceneById(show.data.scenes, activeSceneId ?? selectedSceneId ?? show.data.defaultSceneId) ??
    selectedScene()
  );
}

function editorScene(): Scene {
  return zoneEditSession?.draft ?? selectedScene();
}

function replaceShowScene(scene: Scene, dirty = true): void {
  const next = replaceScene(sceneSet(), scene);
  show.data = { ...show.data, ...next };
  if (dirty) markShowDirty();
}

function updateSelectedScene(update: (scene: Scene) => Scene, dirty = true): Scene {
  const next = update(cloneScene(selectedScene()));
  if (zoneEditSession) {
    zoneEditSession = { ...zoneEditSession, draft: cloneScene(next) };
    return next;
  }
  replaceShowScene(next, dirty);
  return next;
}

function contrastColor(color: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return '#ffffff';
  const value = Number.parseInt(match[1] ?? 'ffffff', 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return red * 0.299 + green * 0.587 + blue * 0.114 > 150 ? '#111111' : '#ffffff';
}

function outputTheme(scene: Scene = activeScene()): ThemeMessage {
  const colors = team()?.colors ?? { primary: '#111111', secondary: '#ffffff' };
  const background = scene.background.kind;
  return {
    primary: colors.primary,
    secondary: colors.secondary,
    foreground: contrastColor(background === 'secondary' ? colors.secondary : colors.primary),
    background,
  };
}

function resourceDirtyNames(): string[] {
  const names: string[] = [];
  if (show.dirty) names.push(show.filePath ? basename(show.filePath, style) : 'Untitled.picta');
  if (mediaDirty) names.push(mediaFilePath ? basename(mediaFilePath, style) : 'Untitled.pictaset');
  if (teamDirty) names.push(teamFilePath ? basename(teamFilePath, style) : 'Untitled.pictateam');
  return names;
}

function syncTitle(): void {
  const name = show.filePath ? basename(show.filePath, style).replace(/\.picta$/i, '') : 'Untitled';
  void appWindow.setTitle(`${show.dirty ? '• ' : ''}${name} — Picta`);
}

function markShowDirty(): void {
  show.dirty = true;
  syncTitle();
}

function markResourceDirty(kind: 'media' | 'team'): void {
  if (kind === 'media') {
    mediaDirty = true;
    if (show.data.media.kind === 'inline') markShowDirty();
  } else {
    teamDirty = true;
    if (show.data.team?.kind !== 'file') markShowDirty();
  }
}

function reconcileEventForTeam(data: ShowDocument['event'], current: Team): ShowDocument['event'] {
  const playerIds = new Set(current.players.map((player) => player.id));
  const groupById = new Map(current.groups.map((group) => [group.id, group]));
  const stats = Object.fromEntries(
    Object.entries(data.stats).filter(([playerId]) => playerIds.has(playerId)),
  );
  const liveGroups: Record<string, string[]> = {};
  for (const [groupId, ids] of Object.entries(data.liveGroups)) {
    const group = groupById.get(groupId);
    if (!group) continue;
    const filtered = ids.filter((playerId) => playerIds.has(playerId));
    liveGroups[groupId] =
      group.maxPlayers === undefined ? filtered : filtered.slice(0, group.maxPlayers);
  }
  return { stats, liveGroups };
}

function setMessage(value: string | null): void {
  ui.message.textContent = value ?? '';
  ui.message.hidden = value === null;
}

function updateMedia(data: MediaSet, dirty = true): void {
  const resource = show.data.media;
  show.data = { ...show.data, media: { ...resource, data } };
  if (dirty) markResourceDirty('media');
  renderMedia();
  renderOutput();
}

function updateTeam(data: Team, dirty = true): void {
  const resource = show.data.team;
  if (!resource) show.data = { ...show.data, team: { kind: 'inline', data } };
  else show.data = { ...show.data, team: { ...resource, data } };
  show.data = { ...show.data, event: reconcileEventForTeam(show.data.event, data) };
  show.data = {
    ...show.data,
    scenes: show.data.scenes.map((scene) => {
      if (
        scene.liveBoardGroupId !== undefined &&
        !data.groups.some((group) => group.id === scene.liveBoardGroupId)
      ) {
        const { liveBoardGroupId: _removedGroup, ...withoutGroup } = scene;
        return withoutGroup;
      }
      return scene;
    }),
  };
  if (dirty) markResourceDirty('team');
  if (!selectedRosterGroupId) selectedRosterGroupId = data.groups[0]?.id ?? null;
  if (!selectedLiveGroupId) selectedLiveGroupId = data.groups[0]?.id ?? null;
  renderPlayers();
  renderOutput();
  if (output.active) {
    output.setTheme(outputTheme(zoneEditSession?.draft ?? activeScene()));
    updateOutputBoard();
  }
}

function currentDefinition(): ReturnType<typeof getSportDefinition> | null {
  const current = team();
  return current ? getSportDefinition(current.sport, current.customSport) : null;
}

function liveGroupId(scene: Scene = activeScene()): string | null {
  const current = team();
  if (!current) return null;
  const requested = scene.liveBoardGroupId ?? selectedLiveGroupId;
  return current.groups.some((group) => group.id === requested)
    ? (requested ?? null)
    : (current.groups[0]?.id ?? null);
}

function setLiveBoardGroupId(groupId: string | null): void {
  updateSelectedScene((scene) => {
    if (groupId) return { ...scene, liveBoardGroupId: groupId };
    const { liveBoardGroupId: _ignored, ...rest } = scene;
    return rest;
  });
}

/**
 * Switch the scene the physical board is using.  This is a runtime operation:
 * it never dirties the show.
 */
function activateScene(sceneId: string): void {
  const scene = sceneById(show.data.scenes, sceneId);
  if (!scene || zoneEditSession) return;
  if (manualSession?.currentPlayerId) manualSession = cancelManualPlayer(manualSession);
  selectedSceneId = scene.id;
  if (output.active) {
    activeSceneId = scene.id;
    output.applyScene(scene, liveBoardData(scene));
    output.setTheme(outputTheme(scene));
  }
  renderOutput();
}

/**
 * Choose which scene the Output tab is configuring.  While output is live this
 * deliberately leaves the board alone — the operator switches the board from
 * the global strip, or with the explicit Switch action next to the layout.
 */
function selectScene(sceneId: string): void {
  if (zoneEditSession || !sceneById(show.data.scenes, sceneId)) return;
  selectedSceneId = sceneId;
  if (!output.active) activeSceneId = null;
  renderOutput();
}

function renderScenes(): void {
  renderSceneStrip(
    { strip: ui.sceneStrip, buttons: ui.sceneButtons },
    {
      scenes: show.data.scenes,
      activeSceneId,
      // The quick-switch strip only earns its space while output is live.
      live: output.active,
      onSwitch: (sceneId) => activateScene(sceneId),
    },
  );
  renderScenePicker(
    {
      picker: ui.scenePicker,
      current: ui.sceneCurrent,
      hint: ui.sceneHint,
      menu: ui.sceneMenu,
      duplicate: ui.sceneDuplicate,
      rename: ui.sceneRename,
      makeDefault: ui.sceneDefault,
      moveLeft: ui.sceneMoveLeft,
      moveRight: ui.sceneMoveRight,
      remove: ui.sceneDelete,
    },
    {
      scenes: show.data.scenes,
      selectedSceneId: selectedScene().id,
      activeSceneId,
      defaultSceneId: show.data.defaultSceneId,
      live: output.active,
      editing: zoneEditSession !== null,
      onSelect: (sceneId) => selectScene(sceneId),
    },
  );
}

function closeSceneMenu(): void {
  ui.sceneMenu.open = false;
}

function applySceneSet(next: SceneSet): void {
  show.data = { ...show.data, ...next };
  markShowDirty();
  renderOutput();
}

async function newSceneFromMenu(): Promise<void> {
  closeSceneMenu();
  const name = await askSceneName(sceneDialogElements(), {
    kind: 'new',
    initialName: '',
    validate: (value) => (sceneNameTaken(show.data.scenes, value) ? nameTakenMessage : null),
  });
  if (!name) return;
  const scene: Scene = {
    id: nextSceneId(show.data.scenes, name),
    name,
    layout: layoutPreset('full'),
    background: { kind: 'black' },
  };
  selectedSceneId = scene.id;
  applySceneSet(addScene(sceneSet(), scene));
}

async function duplicateSceneFromMenu(): Promise<void> {
  closeSceneMenu();
  const source = selectedScene();
  const name = await askSceneName(sceneDialogElements(), {
    kind: 'duplicate',
    initialName: `${source.name} Copy`,
    validate: (value) => (sceneNameTaken(show.data.scenes, value) ? nameTakenMessage : null),
  });
  if (!name) return;
  const scene = { ...cloneScene(source), id: nextSceneId(show.data.scenes, name), name };
  selectedSceneId = scene.id;
  applySceneSet(addScene(sceneSet(), scene));
}

async function renameSceneFromMenu(): Promise<void> {
  closeSceneMenu();
  const scene = selectedScene();
  const name = await askSceneName(sceneDialogElements(), {
    kind: 'rename',
    initialName: scene.name,
    validate: (value) =>
      sceneNameTaken(show.data.scenes, value, scene.id) ? nameTakenMessage : null,
  });
  if (!name) return;
  applySceneSet(renameScene(sceneSet(), scene.id, name));
}

async function deleteSceneFromMenu(): Promise<void> {
  closeSceneMenu();
  const scene = selectedScene();
  if (output.active && scene.id === activeSceneId) {
    setMessage('Switch to another scene before deleting the one on the board.');
    return;
  }
  if (show.data.scenes.length <= 1) {
    setMessage('A show must keep at least one scene.');
    return;
  }
  if (!(await confirmDeleteScene(sceneDeleteElements(), scene.name))) return;
  const next = removeScene(sceneSet(), scene.id);
  if (!next) return;
  selectedSceneId = next.scenes[0]?.id ?? null;
  applySceneSet(next);
}

const nameTakenMessage = 'Another scene already uses that name.';

function sceneDialogElements() {
  return {
    dialog: ui.sceneDialog,
    form: ui.sceneDialogForm,
    title: ui.sceneDialogTitle,
    name: ui.sceneDialogName,
    error: ui.sceneDialogError,
    confirm: ui.sceneDialogConfirm,
  };
}

function sceneDeleteElements() {
  return { dialog: ui.sceneDeleteDialog, text: ui.sceneDeleteText };
}

function layoutEditMessage(scene: Scene, width: number, height: number): LayoutEditPreviewMessage {
  const rects = resolveZoneRects(scene.layout, width, height);
  const area = Math.max(1, width * height);
  return {
    layout: scene.layout,
    outputWidth: width,
    outputHeight: height,
    selectedZoneId: zoneEditSession?.selectedZoneId ?? null,
    showSafeAreas: zoneEditSession?.showSafeAreas ?? true,
    zones: rects.map((rect, index) => ({
      ...rect,
      number: index + 1,
      sharePercent: Math.round((rect.width * rect.height * 10000) / area) / 100,
    })),
  };
}

function currentOutputDimensions(): { width: number; height: number } {
  const display = findById(displays, selectedDisplayId);
  return { width: display?.width ?? 1920, height: display?.height ?? 1080 };
}

function sendLayoutEditPreview(): void {
  if (!zoneEditSession || !output.active) return;
  const { width, height } = currentOutputDimensions();
  output.previewLayout(layoutEditMessage(zoneEditSession.draft, width, height));
}

/** True when Edit Zones would silently repurpose the live board. */
function zoneEditNeedsSwitch(): boolean {
  return output.active && activeSceneId !== null && selectedScene().id !== activeSceneId;
}

function beginZonesEdit(): void {
  if (zoneEditSession) return;
  // Editing puts the physical board into calibration mode; never do that to a
  // scene the operator is not looking at.
  if (zoneEditNeedsSwitch()) {
    setMessage('Switch the board to this scene before editing its zones.');
    renderOutput();
    return;
  }
  // Done, Cancel and the zone tools all live in Output. Never leave the board
  // in calibration mode with no visible way out.
  if (activeTab !== 'output') selectTab('output');
  zoneEditSession = beginZoneEdit(selectedScene());
  if (output.active) {
    const { width, height } = currentOutputDimensions();
    output.beginLayoutEdit(layoutEditMessage(zoneEditSession.draft, width, height));
  }
  renderOutput();
}

function setDraftLayoutChecked(layout: LayoutNode, warning?: string): void {
  if (!zoneEditSession) return;
  if (!validateLayout(layout).ok) {
    if (warning) setMessage(warning);
    renderOutput();
    return;
  }
  zoneEditSession = setDraftLayout(zoneEditSession, layout);
  renderOutput();
  sendLayoutEditPreview();
}

function cancelZonesEdit(): void {
  if (!zoneEditSession) return;
  const original = cancelZoneEdit(zoneEditSession);
  zoneEditSession = null;
  if (output.active) {
    output.endLayoutEdit(original.layout, liveBoardData(original));
    output.setTheme(outputTheme(original));
  }
  renderOutput();
}

function doneZonesEdit(): void {
  if (!zoneEditSession) return;
  const next = commitZoneEdit(zoneEditSession);
  zoneEditSession = null;
  replaceShowScene(next);
  if (output.active) {
    output.endLayoutEdit(next.layout, liveBoardData(next));
    output.setTheme(outputTheme(next));
  }
  renderOutput();
}

function liveBoardData(scene: Scene = activeScene()): BoardData {
  const current = team();
  const definition = currentDefinition();
  const groupId = liveGroupId(scene);
  if (!current || !definition || !groupId) return { columns: [], rows: [] };
  const group = current.groups.find((item) => item.id === groupId);
  if (!group) return { columns: [], rows: [] };
  const live = show.data.event.liveGroups[groupId];
  const effective = live === undefined ? group : { ...group, playerIds: live };
  return formatBoardData(current.players, effective, definition, show.data.event.stats);
}

const output = new OutputController({
  onPosition: (position, total) => {
    if (total > 0) setMessage(`Showing media ${position} of ${total}.`);
    updateGlobalStatus();
  },
  onStopped: (reason) => {
    if (reason === 'display-lost')
      setMessage('Output display disconnected. Choose the same display to resume.');
    renderOutput();
    updateGlobalStatus();
  },
  onCueState: (state) => {
    renderCueControls(state);
    if (manualSession && team()) renderPlayers();
    updateGlobalStatus();
  },
  onWarning: (message) => setMessage(message),
});

/**
 * Cue controls describe the operation, not the queue.  A single manually
 * chosen player has no "next", so it does not get a Next button.
 */
function renderCueControls(state: CueQueueState): void {
  ui.cueControls.hidden = !state.active;
  if (!state.active) return;
  const context = output.cueContext;
  const ordered = context?.kind === 'ordered-group';
  ui.cueStatus.textContent = ordered
    ? `${context.label} · ${state.index + 1} of ${state.total}`
    : (context?.label ?? '');
  ui.cuePrevious.hidden = !ordered;
  ui.cueNext.hidden = !ordered;
  ui.cuePrevious.disabled = state.index <= 0;
  ui.cueEnd.textContent = ordered
    ? 'End Lineup'
    : context?.kind === 'single-player'
      ? 'End Player'
      : 'End';
}

function manualGroupName(session: ManualGroupSession): string {
  return team()?.groups.find((group) => group.id === session.groupId)?.name ?? session.groupId;
}

/**
 * One short line the operator can glance at.  It says what Picta believes is
 * on the board right now — never a log.
 */
function updateGlobalStatus(): void {
  if (!output.active) {
    ui.globalStatus.textContent = `Ready · ${selectedScene().name}`;
    ui.globalStatus.classList.remove('live');
    return;
  }
  const display = findById(displays, selectedDisplayId);
  const context = output.cueContext;
  const cueState = output.cueState;
  const detail = context
    ? context.kind === 'ordered-group'
      ? `${context.label} ${cueState.index + 1}/${cueState.total}`
      : context.label
    : manualSession
      ? `${manualGroupName(manualSession)} ${manualShownCount(manualSession)}/${manualSession.playerIds.length}`
      : (display && displayLabel(display)) || 'Output';
  ui.globalStatus.textContent = `● LIVE · ${activeScene().name} · ${detail}`;
  ui.globalStatus.classList.add('live');
}

function selectTab(tab: TabName): void {
  activeTab = tab;
  const names: TabName[] = ['media', 'players', 'output'];
  for (let index = 0; index < names.length; index += 1) {
    const selected = names[index] === tab;
    const button = ui.tabs[index] as HTMLButtonElement;
    const panel = ui.panels[index] as HTMLElement;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    panel.hidden = !selected;
  }
}

function setPlayerView(view: PlayerView): void {
  playerView = view;
  ui.rosterView.hidden = view !== 'roster';
  ui.liveView.hidden = view !== 'live';
  ui.rosterViewTab.classList.toggle('active', view === 'roster');
  ui.liveViewTab.classList.toggle('active', view === 'live');
  renderPlayers();
}

function renderMedia(): void {
  const data = mediaSet();
  ui.mediaResourceName.textContent =
    show.data.media.kind === 'file' && mediaFilePath
      ? `${basename(mediaFilePath, style)}${mediaDirty ? ' · unsaved' : ''}`
      : `${data.name}${mediaDirty ? ' · unsaved' : ''}`;
  ui.mediaList.replaceChildren();
  data.items.forEach((item, index) => {
    const row = document.createElement('article');
    row.className = 'media-item';
    const preview = document.createElement('div');
    preview.className = 'media-preview';
    if (item.type === 'image' && !item.missing) {
      const image = document.createElement('img');
      image.src = convertFileSrc(item.path);
      image.alt = '';
      image.addEventListener('error', () => image.remove(), { once: true });
      preview.append(image);
    } else {
      preview.textContent = item.type === 'video' ? '▶' : '?';
    }
    const body = document.createElement('div');
    body.style.minWidth = '0';
    const name = document.createElement('div');
    name.className = 'media-name';
    name.textContent = basename(item.path, style);
    const meta = document.createElement('div');
    meta.className = 'media-meta';
    meta.textContent = item.missing
      ? 'Missing'
      : item.type === 'video'
        ? 'Video'
        : `${mediaDurationSeconds(item, data)} seconds`;
    const actions = document.createElement('div');
    actions.className = 'media-actions';
    const action = (label: string, handler: () => void, disabled = false) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.disabled = disabled;
      button.addEventListener('click', handler);
      actions.append(button);
    };
    action('Show Now', () => void showMediaNow(item), !output.active || item.missing);
    action(
      '↑',
      () => {
        if (index > 0) updateMedia({ ...data, items: moveMediaItem(data.items, index, index - 1) });
      },
      index === 0,
    );
    action(
      '↓',
      () => {
        if (index < data.items.length - 1)
          updateMedia({ ...data, items: moveMediaItem(data.items, index, index + 1) });
      },
      index === data.items.length - 1,
    );
    action('Remove', () =>
      updateMedia({ ...data, items: data.items.filter((_, itemIndex) => itemIndex !== index) }),
    );
    body.append(name, meta, actions);
    row.append(preview, body);
    ui.mediaList.append(row);
  });
  const missing = data.items.filter((item) => item.missing).length;
  ui.mediaCount.textContent =
    data.items.length === 0
      ? 'No media'
      : `${data.items.length} item${data.items.length === 1 ? '' : 's'}`;
  ui.mediaClear.hidden = data.items.length === 0;
  ui.mediaMissing.hidden = missing === 0;
  ui.mediaMissingText.textContent = `${missing} media file${missing === 1 ? '' : 's'} could not be found.`;
  ui.mediaDuration.replaceChildren();
  const choices = [...new Set([...INTERVAL_CHOICES, data.imageDurationSeconds])].sort(
    (a, b) => a - b,
  );
  for (const seconds of choices) {
    const option = document.createElement('option');
    option.value = String(seconds);
    option.textContent = `${seconds} seconds`;
    ui.mediaDuration.append(option);
  }
  ui.mediaDuration.value = String(data.imageDurationSeconds);
  ui.mediaTransition.value = data.transition;
  ui.mediaSizing.value = data.imageSizing;
  ui.mediaPrevious.disabled = !output.active;
  ui.mediaNext.disabled = !output.active;
}

async function showMediaNow(item: MediaItem): Promise<void> {
  if (!output.active || item.missing) return;
  const cue: Cue =
    item.type === 'video'
      ? { type: 'video', target: 'program', path: item.path, label: basename(item.path, style) }
      : {
          type: 'image',
          target: 'program',
          path: item.path,
          holdMs: Math.max(3000, mediaDurationSeconds(item, mediaSet()) * 1000),
          label: basename(item.path, style),
        };
  await output.playCues([cue], { kind: 'single-media', label: basename(item.path, style) });
}

async function addMedia(paths: readonly string[]): Promise<void> {
  const supported = paths.filter(isSupportedMediaPath);
  if (supported.length === 0) {
    setMessage('Picta supports PNG, JPEG, WebP, MP4 and WebM.');
    return;
  }
  const merged = appendMedia(mediaSet(), supported);
  updateMedia(merged);
  await ipc.allowMedia(supported).catch(() => undefined);
  setMessage(
    supported.length < paths.length
      ? 'Some files were skipped because their type is not supported.'
      : null,
  );
}

async function locateMedia(): Promise<void> {
  const data = mediaSet();
  const missing = data.items.filter((item) => item.missing);
  if (missing.length === 0) return;
  const folder = window.prompt(
    'Folder containing the moved media files:',
    prefs.lastDirectory ?? '',
  );
  if (!folder) return;
  const candidates = missing.map((item) => `${folder}/${basename(item.path, style)}`);
  const exists = await ipc.pathsExist(candidates).catch(() => candidates.map(() => false));
  const next = data.items.map((item) => {
    const index = missing.findIndex((candidate) => candidate.id === item.id);
    const replacement = index >= 0 && exists[index] ? candidates[index] : null;
    return replacement ? { ...item, path: replacement, missing: false } : item;
  });
  if (next.some((item, index) => item.path !== data.items[index]?.path))
    updateMedia({ ...data, items: next });
}

function renderTeamHeader(current: Team): void {
  ui.teamName.textContent = current.name;
  ui.teamDetail.textContent = getSportDefinition(current.sport, current.customSport).name;
  ui.teamFileName.textContent = teamFilePath
    ? `${basename(teamFilePath, style)}${teamDirty ? ' · unsaved' : ''}`
    : 'Inline team';
}

async function locateTeamMedia(): Promise<void> {
  const current = team();
  if (!current) return;
  const missing = current.players.flatMap((player) =>
    [
      ...(player.media.photo ? [{ kind: 'photo' as const, media: player.media.photo }] : []),
      ...(player.media.introVideo
        ? [{ kind: 'introVideo' as const, media: player.media.introVideo }]
        : []),
    ]
      .filter((item) => item.media.missing)
      .map((item) => ({ playerId: player.id, kind: item.kind, path: item.media.path })),
  );
  if (missing.length === 0) {
    setMessage('No missing team media was found.');
    return;
  }
  const folder = window.prompt(
    'Folder containing the moved team media files:',
    prefs.lastDirectory ?? '',
  );
  if (!folder) return;
  const candidates = missing.map((item) => `${folder}/${basename(item.path, style)}`);
  const exists = await ipc.pathsExist(candidates).catch(() => candidates.map(() => false));
  const replacements = new Map(
    missing.flatMap((item, index) =>
      exists[index] ? [[`${item.playerId}:${item.kind}`, candidates[index]] as const] : [],
    ),
  );
  if (replacements.size === 0) {
    setMessage('No missing team media was found in that folder.');
    return;
  }
  const next: Team = {
    ...current,
    players: current.players.map((player) => ({
      ...player,
      media: {
        ...(player.media.photo
          ? {
              photo: replacements.has(`${player.id}:photo`)
                ? { path: replacements.get(`${player.id}:photo`)! }
                : player.media.photo,
            }
          : {}),
        ...(player.media.introVideo
          ? {
              introVideo: replacements.has(`${player.id}:introVideo`)
                ? { path: replacements.get(`${player.id}:introVideo`)! }
                : player.media.introVideo,
            }
          : {}),
      },
    })),
  };
  const relinkedPaths = [...replacements.values()].filter(
    (path): path is string => path !== undefined,
  );
  await ipc.allowMedia(relinkedPaths).catch(() => undefined);
  updateTeam(next);
  setMessage(`${replacements.size} team media file${replacements.size === 1 ? '' : 's'} relinked.`);
}

function updateCustomSport(
  current: Team,
  stats: { id: string; label: string; shortLabel: string }[],
): void {
  const custom = current.customSport;
  if (!custom) return;
  updateTeam({
    ...current,
    customSport: makeCustomSport(custom.name, stats, custom.positions),
  });
}

function renderCustomSportEditor(current: Team): void {
  const editor = ui.customSportEditor;
  const custom = current.sport === 'custom' ? current.customSport : undefined;
  editor.hidden = custom === undefined;
  editor.replaceChildren();
  if (!custom) return;
  const heading = document.createElement('strong');
  heading.textContent = `${custom.name} statistics`;
  editor.append(heading);
  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent = 'Simple raw counters; derived formulas are not stored.';
  editor.append(note);
  for (const [index, stat] of custom.stats.entries()) {
    const row = document.createElement('div');
    row.className = 'custom-stat-row';
    const text = document.createElement('span');
    text.textContent = `${stat.label} (${stat.shortLabel}) · ${stat.id}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'small-button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      updateCustomSport(
        current,
        custom.stats.filter((_, statIndex) => statIndex !== index),
      );
    });
    row.append(text, remove);
    editor.append(row);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'small-button';
  add.textContent = 'Add Statistic';
  add.addEventListener('click', () => {
    const id = window.prompt('Statistic id (for example, points):');
    const label = window.prompt('Statistic label:', id ?? '');
    const shortLabel = window.prompt('Short label:', label?.slice(0, 4).toUpperCase() ?? '');
    if (!id?.trim() || !label?.trim() || !shortLabel?.trim()) return;
    updateCustomSport(current, [
      ...custom.stats.map(({ id: statId, label: statLabel, shortLabel: statShort }) => ({
        id: statId,
        label: statLabel,
        shortLabel: statShort,
      })),
      { id, label, shortLabel },
    ]);
  });
  editor.append(add);
}

function renderGroupEditor(current: Team): void {
  const groupId = selectedRosterGroupId ?? current.groups[0]?.id;
  selectedRosterGroupId = groupId ?? null;
  ui.groupSelect.replaceChildren();
  for (const group of current.groups) {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.name;
    ui.groupSelect.append(option);
  }
  if (groupId) ui.groupSelect.value = groupId;
  const group = current.groups.find((item) => item.id === groupId);
  ui.groupEditor.replaceChildren();
  const groupActions = document.createElement('div');
  groupActions.className = 'row gap';
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'small-button grow';
  play.textContent = 'Play in Order';
  play.disabled = !output.active || output.cueActive || !group;
  if (group) play.addEventListener('click', () => void playGroup(group));
  const manual = document.createElement('button');
  manual.type = 'button';
  manual.className = 'small-button grow';
  manual.textContent = 'Present Manually';
  manual.disabled = !output.active || output.cueActive || !group;
  if (group)
    manual.addEventListener('click', () => {
      manualSession = beginManualGroup(group.id, group.playerIds);
      renderPlayers();
      updateGlobalStatus();
    });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'small-button';
  add.textContent = 'New Group';
  add.addEventListener('click', () => {
    const name = window.prompt('Group name:');
    if (!name?.trim()) return;
    const next = addGroup(current, makeGroup(name));
    selectedRosterGroupId = next.groups.at(-1)?.id ?? selectedRosterGroupId;
    updateTeam(next);
  });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'small-button';
  remove.textContent = 'Remove Group';
  remove.disabled = current.groups.length <= 1 || !group;
  if (group)
    remove.addEventListener('click', () => {
      if (!window.confirm(`Remove the group “${group.name}”?`)) return;
      const next = removeGroup(current, group.id);
      selectedRosterGroupId = next.groups[0]?.id ?? null;
      updateTeam(next);
    });
  groupActions.append(play, manual, add, remove);
  ui.groupEditor.append(groupActions);
  if (!group) return;
  for (let index = 0; index < group.playerIds.length; index += 1) {
    const player = current.players.find((item) => item.id === group.playerIds[index]);
    if (!player) continue;
    const row = document.createElement('div');
    row.className = 'group-row';
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '☰';
    const number = document.createElement('span');
    number.className = 'number';
    number.textContent = player.number ? `#${player.number}` : '';
    const name = document.createElement('span');
    name.textContent = player.name;
    const actions = document.createElement('span');
    actions.className = 'group-actions';
    const button = (label: string, handler: () => void, disabled = false) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = label;
      item.disabled = disabled;
      item.addEventListener('click', handler);
      actions.append(item);
    };
    button(
      '↑',
      () => updateTeam(reorderGroupPlayer(current, group.id, index, index - 1)),
      index === 0,
    );
    button(
      '↓',
      () => updateTeam(reorderGroupPlayer(current, group.id, index, index + 1)),
      index === group.playerIds.length - 1,
    );
    button('Remove', () => updateTeam(removePlayerFromGroup(current, group.id, player.id)));
    row.append(handle, number, name, actions);
    ui.groupEditor.append(row);
  }
  const available = current.players.filter((player) => !group.playerIds.includes(player.id));
  if (available.length > 0) {
    const add = document.createElement('select');
    add.className = 'control';
    add.ariaLabel = 'Add player to group';
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = '+ Add Player';
    add.append(prompt);
    for (const player of available) {
      const option = document.createElement('option');
      option.value = player.id;
      option.textContent = `+ ${player.number ? `#${player.number} ` : ''}${player.name}`;
      add.append(option);
    }
    add.addEventListener('change', () => {
      if (add.value) {
        updateTeam(addPlayerToGroup(current, group.id, add.value));
      }
    });
    ui.groupEditor.append(add);
  }
}

function playerLabel(player: Player): string {
  return `${player.number ? `#${player.number} ` : ''}${player.name}`;
}

/**
 * The manual lineup takes over the Players tab while it runs, so the operator
 * sees the lineup and nothing else during introductions.
 */
function renderManualSession(current: Team): void {
  const session = manualSession;
  const group = session ? current.groups.find((item) => item.id === session.groupId) : undefined;
  // A group deleted mid-session ends it rather than stranding the workspace.
  if (session && !group) manualSession = null;
  const active = manualSession !== null && group !== undefined;
  ui.rosterSetup.hidden = active;
  ui.playerSubtabs.hidden = active;
  if (active) ui.playerInspector.hidden = true;
  renderManualWorkspace(
    {
      section: ui.manualSession,
      title: ui.manualTitle,
      count: ui.manualCount,
      rows: ui.manualRows,
      undo: ui.manualUndo,
      end: ui.manualEnd,
    },
    manualSession && group
      ? {
          session: manualSession,
          group,
          players: current.players,
          outputActive: output.active,
          onPresent: (playerId) => void presentManualPlayer(playerId),
          onUndo: () => {
            if (manualSession) manualSession = undoManualPlayer(manualSession);
            renderPlayers();
            updateGlobalStatus();
          },
          onEnd: () => endManualSession(),
        }
      : null,
  );
}

/** End Lineup returns the tab to the normal roster UI; nothing lingers. */
function endManualSession(): void {
  if (!manualSession) return;
  if (manualSession.currentPlayerId !== null) output.cancelCue();
  manualSession = null;
  renderPlayers();
  updateGlobalStatus();
}

/** Explain a presentation the audience did not see.  Never on the output. */
function reportPresentation(
  report: { outcome: PresentationOutcome; usedCardFallback: boolean },
  player: Player,
  mode: 'preferred' | 'card' | 'video',
): void {
  const name = playerLabel(player);
  if (report.outcome === 'cancelled') return;
  if (report.outcome === 'unavailable') {
    setMessage(`${name} has no usable intro video.`);
    return;
  }
  if (report.outcome === 'failed') {
    setMessage(
      mode === 'video' ? `${name}'s intro video could not play.` : `Could not present ${name}.`,
    );
    return;
  }
  if (report.usedCardFallback)
    setMessage(`${name}'s intro video could not play, so the player card was shown.`);
  else setMessage(null);
}

function presentSinglePlayer(
  player: Player,
  current: Team,
  mode: 'preferred' | 'card' | 'video',
): Promise<{ outcome: PresentationOutcome; usedCardFallback: boolean }> {
  const context: CueContext = { kind: 'single-player', label: playerLabel(player) };
  return presentPlayer(
    player,
    current,
    show.data.event,
    { mode },
    {
      play: (cue) => output.playCue(cue, context),
    },
  );
}

async function presentManualPlayer(playerId: string): Promise<void> {
  const session = manualSession;
  if (!session || !output.active || output.cueActive) return;
  const current = team();
  const player = current?.players.find((item) => item.id === playerId);
  if (!current || !player) return;
  const started = startManualPlayer(session, playerId);
  if (started === session) return;
  manualSession = started;
  renderPlayers();
  updateGlobalStatus();
  // Manual and ordered lineups share the same preferred presentation; only the
  // choice of who goes next differs.
  const report = await presentSinglePlayer(player, current, 'preferred');
  if (manualSession?.currentPlayerId === playerId)
    manualSession = finishManualPlayer(manualSession, report.outcome);
  reportPresentation(report, player, 'preferred');
  renderPlayers();
  updateGlobalStatus();
}

function cancelActiveCue(): void {
  if (manualSession?.currentPlayerId != null) {
    manualSession = cancelManualPlayer(manualSession);
    renderPlayers();
    updateGlobalStatus();
  }
  output.cancelCue();
}

function renderRosterList(current: Team): void {
  ui.rosterList.replaceChildren();
  for (const player of current.players) {
    const row = document.createElement('div');
    row.className = 'roster-row';
    row.tabIndex = 0;
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '☰';
    const number = document.createElement('span');
    number.className = 'roster-number';
    number.textContent = player.number ? `#${player.number}` : '';
    const name = document.createElement('span');
    name.textContent = player.name;
    const position = document.createElement('span');
    position.className = 'roster-position';
    position.textContent = player.position ?? '';
    const actions = document.createElement('span');
    actions.className = 'roster-actions';
    const inspect = document.createElement('button');
    inspect.type = 'button';
    inspect.className = 'small-button';
    inspect.textContent = 'Edit';
    inspect.addEventListener('click', () => {
      selectedPlayerId = player.id;
      renderPlayers();
    });
    const showButton = document.createElement('button');
    showButton.type = 'button';
    showButton.className = 'small-button';
    showButton.textContent = 'Show Card';
    showButton.disabled = !output.active;
    showButton.addEventListener('click', () => void showPlayerCard(player));
    actions.append(inspect, showButton);
    row.append(handle, number, name, position, actions);
    row.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('button')) return;
      selectedPlayerId = player.id;
      renderPlayers();
    });
    ui.rosterList.append(row);
  }
}

/** Show Card always shows the card, even when an intro video exists. */
async function showPlayerCard(player: Player): Promise<void> {
  const current = team();
  if (!current || !output.active) return;
  reportPresentation(await presentSinglePlayer(player, current, 'card'), player, 'card');
}

/** Play Intro Video never quietly degrades into a card. */
async function showPlayerVideo(player: Player): Promise<void> {
  const current = team();
  if (!current || !output.active) return;
  reportPresentation(await presentSinglePlayer(player, current, 'video'), player, 'video');
}

async function playGroup(group: import('./core/domain.js').PlayerGroup): Promise<void> {
  if (!output.active) return;
  const current = team();
  if (!current) return;
  const cues = cuesForPlayers(group.playerIds, current, show.data.event);
  if (cues.length === 0) {
    setMessage('This group has no usable players.');
    return;
  }
  await output.playCues(cues, { kind: 'ordered-group', label: group.name });
}

function renderInspector(current: Team): void {
  const player = current.players.find((item) => item.id === selectedPlayerId);
  ui.playerInspector.hidden = !player;
  ui.playerInspector.replaceChildren();
  if (!player) return;
  const definition = currentDefinition();
  const heading = document.createElement('h3');
  heading.textContent = `${player.number ? `#${player.number} ` : ''}${player.name}`;
  const field = (
    labelText: string,
    value: string,
    onChange: (value: string) => void,
    wide = false,
  ) => {
    const label = document.createElement('label');
    if (wide) label.classList.add('wide-field');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.value = value;
    input.addEventListener('change', () => onChange(input.value));
    label.append(input);
    return label;
  };
  const name = field('Name', player.name, (value) => {
    updateTeam(updatePlayer(current, { ...player, name: value.trim() || player.name }));
  });
  const number = field('Number', player.number, (value) => {
    updateTeam(updatePlayer(current, { ...player, number: value.trim() }));
  });
  const position = field('Position', player.position ?? '', (value) => {
    updateTeam(updatePlayer(current, { ...player, position: value.trim() }));
  });
  const mediaSection = document.createElement('div');
  mediaSection.className = 'inspector-section';
  const mediaTitle = document.createElement('strong');
  mediaTitle.textContent = 'Media';
  mediaSection.append(mediaTitle);
  const mediaRow = (labelText: string, value: string, chooseVideo: boolean) => {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('span');
    label.textContent = `${labelText}: ${value || 'None'}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'small-button';
    button.textContent = 'Change';
    button.addEventListener('click', async () => {
      const picked = await chooseMedia(prefs.lastDirectory);
      const path = picked.find((item) =>
        chooseVideo ? isSupportedVideoPath(item) : isSupportedImagePath(item),
      );
      if (!path) return;
      await ipc.allowMedia([path]).catch(() => undefined);
      const next = {
        ...player,
        media: {
          ...player.media,
          ...(chooseVideo ? { introVideo: { path } } : { photo: { path } }),
        },
      };
      updateTeam(updatePlayer(current, next));
    });
    row.append(label, button);
    return row;
  };
  mediaSection.append(
    mediaRow(
      'Photo',
      player.media.photo?.path ? basename(player.media.photo.path, style) : '',
      false,
    ),
    mediaRow(
      'Intro video',
      player.media.introVideo?.path ? basename(player.media.introVideo.path, style) : '',
      true,
    ),
  );
  const statsSection = document.createElement('div');
  statsSection.className = 'inspector-section';
  const statsTitle = document.createElement('strong');
  statsTitle.textContent = 'Featured board stats';
  statsSection.append(statsTitle);
  const checks = document.createElement('div');
  checks.className = 'stat-checks';
  const selected: Set<string> = new Set<string>(
    player.featuredStats ?? definition?.defaultFeaturedStats ?? [],
  );
  for (const stat of definition?.stats ?? []) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = selected.has(stat.id);
    input.addEventListener('change', () => {
      const ids = [...selected].filter((id) => id !== stat.id);
      if (input.checked) ids.push(stat.id);
      updateTeam(updatePlayer(current, { ...player, featuredStats: ids.slice(0, 4) }));
    });
    label.append(input, document.createTextNode(stat.shortLabel));
    checks.append(label);
  }
  statsSection.append(checks);
  const actions = document.createElement('div');
  actions.className = 'row gap';
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'small-button grow';
  card.textContent = 'Show Card';
  card.disabled = !output.active;
  // Show Card stays available whether or not the player has a video.
  if (!output.active) card.title = 'Start output to present a player.';
  card.addEventListener('click', () => void showPlayerCard(player));
  const video = document.createElement('button');
  video.type = 'button';
  video.className = 'small-button grow';
  video.textContent = 'Play Intro Video';
  const hasVideo = playerHasVideo(player);
  video.disabled = !output.active || !hasVideo;
  video.title = !hasVideo
    ? 'This player has no usable intro video.'
    : !output.active
      ? 'Start output to present a player.'
      : '';
  video.addEventListener('click', () => void showPlayerVideo(player));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'small-button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    updateTeam(removePlayer(current, player.id));
    selectedPlayerId = null;
  });
  actions.append(card, video, remove);
  ui.playerInspector.append(heading, name, number, position, mediaSection, statsSection, actions);
}

function renderLive(current: Team): void {
  const definition = currentDefinition();
  if (!definition) return;
  selectedLiveGroupId =
    selectedLiveGroupId && current.groups.some((group) => group.id === selectedLiveGroupId)
      ? selectedLiveGroupId
      : (current.groups[0]?.id ?? null);
  ui.liveGroupSelect.replaceChildren();
  for (const group of current.groups) {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.name;
    ui.liveGroupSelect.append(option);
  }
  if (selectedLiveGroupId) ui.liveGroupSelect.value = selectedLiveGroupId;
  const group = current.groups.find((item) => item.id === selectedLiveGroupId);
  if (!group) return;
  const activeIds = new Set(show.data.event.liveGroups[group.id] ?? group.playerIds);
  const columns = boardStatDefinitions(definition);
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['Live', '#', 'Player', ...columns.map((item) => item.shortLabel)]) {
    const cell = document.createElement('th');
    cell.textContent = label;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement('tbody');
  for (const player of current.players) {
    const row = document.createElement('tr');
    const activeCell = document.createElement('td');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = activeIds.has(player.id);
    check.setAttribute('aria-label', `${player.name} in ${group.name}`);
    check.addEventListener('change', () => {
      const ids = [...activeIds];
      if (check.checked) {
        if (group.maxPlayers !== undefined && ids.length >= group.maxPlayers) {
          check.checked = false;
          setMessage(`${group.name} already has ${group.maxPlayers} players.`);
          return;
        }
        ids.push(player.id);
      } else {
        const index = ids.indexOf(player.id);
        if (index >= 0) ids.splice(index, 1);
      }
      show.data.event = {
        ...show.data.event,
        liveGroups: setLiveGroupPlayers(show.data.event.liveGroups, group.id, ids),
      };
      markShowDirty();
      renderLive(current);
      updateOutputBoard();
    });
    activeCell.append(check);
    const number = document.createElement('td');
    number.textContent = player.number ? `#${player.number}` : '';
    const name = document.createElement('td');
    name.textContent = player.name;
    row.append(activeCell, number, name);
    const stats = show.data.event.stats[player.id] ?? emptyRawStats(definition);
    for (const stat of columns) {
      const cell = document.createElement('td');
      const stepper = document.createElement('span');
      stepper.className = 'stat-stepper';
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.textContent = '−';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.value = String(stats[stat.id] ?? 0);
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '+';
      const set = (value: number) => {
        const nextStats = setRawStat(
          definition,
          show.data.event.stats[player.id] ?? emptyRawStats(definition),
          stat.id,
          value,
        );
        show.data.event = {
          ...show.data.event,
          stats: { ...show.data.event.stats, [player.id]: nextStats },
        };
        markShowDirty();
        renderLive(current);
        updateOutputBoard();
      };
      const step = (delta: number) => {
        const nextStats = recordStat(
          definition,
          show.data.event.stats[player.id] ?? emptyRawStats(definition),
          stat.id,
          delta,
        );
        show.data.event = {
          ...show.data.event,
          stats: { ...show.data.event.stats, [player.id]: nextStats },
        };
        markShowDirty();
        renderLive(current);
        updateOutputBoard();
      };
      minus.addEventListener('click', () => step(-1));
      plus.addEventListener('click', () => step(1));
      input.addEventListener('change', () => set(Number(input.value)));
      stepper.append(minus, input, plus);
      cell.append(stepper);
      row.append(cell);
    }
    body.append(row);
  }
  table.append(head, body);
  ui.liveTable.replaceChildren(table);
}

function renderPlayers(): void {
  const current = team();
  ui.noTeam.hidden = current !== undefined;
  ui.teamLoaded.hidden = current === undefined;
  if (!current) return;
  renderTeamHeader(current);
  renderCustomSportEditor(current);
  renderGroupEditor(current);
  renderRosterList(current);
  renderInspector(current);
  if (playerView === 'live') renderLive(current);
  // Last: a running lineup collapses the setup UI the calls above just drew.
  renderManualSession(current);
}

function updateOutputBoard(): void {
  if (output.active) output.setBoard(liveBoardData(zoneEditSession?.draft ?? activeScene()));
}

function renderDisplays(): void {
  ui.displaySelect.replaceChildren();
  if (displays.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No displays found';
    ui.displaySelect.append(option);
    selectedDisplayId = null;
    ui.displaySelect.disabled = true;
    ui.displayDetail.textContent = '';
    return;
  }
  ui.displaySelect.disabled = output.active;
  const prompt = document.createElement('option');
  prompt.value = '';
  prompt.textContent = 'Choose output display';
  ui.displaySelect.append(prompt);
  for (const display of displays) {
    const option = document.createElement('option');
    option.value = display.id;
    option.textContent = `${displayLabel(display)} — ${describeDisplay(display)}`;
    ui.displaySelect.append(option);
  }
  if (selectedDisplayId && displays.some((display) => display.id === selectedDisplayId))
    ui.displaySelect.value = selectedDisplayId;
  else {
    const match = matchDisplay(prefs.displayHint, displays);
    selectedDisplayId = match.confidence === 'exact' && match.display ? match.display.id : null;
    ui.displaySelect.value = selectedDisplayId ?? '';
  }
  const display = findById(displays, selectedDisplayId);
  ui.displayDetail.textContent = display ? describeDisplay(display) : '';
  renderOutput();
}

function commitDividerRatio(path: LayoutPath, ratio: number): void {
  if (!zoneEditSession) return;
  setDraftLayoutChecked(updateSplitRatioAtPath(editorScene().layout, path, ratio));
}

/** Draft-only preview while a divider is being dragged. */
function previewDividerRatio(path: LayoutPath, ratio: number): void {
  if (!zoneEditSession) return;
  const next = updateSplitRatioAtPath(editorScene().layout, path, ratio);
  if (!validateLayout(next).ok) return;
  zoneEditSession = setDraftLayout(zoneEditSession, next);
  sendLayoutEditPreview();
}

/** Rebuild the Start-from presets.  They only exist inside Edit Zones. */
function renderLayoutPresets(layout: LayoutNode): void {
  ui.layoutPresets.replaceChildren();
  const current = layoutPresetId(layout);
  for (const id of LAYOUT_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'small-button';
    button.textContent = layoutPresetLabel(id);
    button.setAttribute('aria-pressed', String(id === current));
    if (id === current) button.classList.add('active');
    // A preset changes the draft only; Cancel still restores the original.
    button.addEventListener('click', () => setDraftLayoutChecked(layoutPreset(id)));
    ui.layoutPresets.append(button);
  }
}

function renderZoneEditor(scene: Scene): void {
  const editing = zoneEditSession !== null;
  ui.layoutHeading.textContent = editing ? `Edit Zones — ${scene.name}` : 'Layout';
  // The editor replaces the normal layout panel rather than stacking below it.
  ui.layoutNormal.hidden = editing;
  ui.zoneEditPanel.hidden = !editing;
  if (!editing) {
    renderLayoutAction();
    return;
  }
  renderLayoutPresets(scene.layout);
  renderZoneSelect(ui.customZoneSelect, scene.layout);
  const zones = layoutZones(scene.layout);
  const selectedZoneId = zoneEditSession?.selectedZoneId ?? zones[0]?.id;
  if (selectedZoneId) ui.customZoneSelect.value = selectedZoneId;
  const role = zones.find((zone) => zone.id === selectedZoneId)?.role;
  if (role) ui.customRoleSelect.value = role;
  ui.mergeZone.disabled = zones.length <= 1;
  ui.zoneEditSafe.checked = zoneEditSession?.showSafeAreas ?? true;
}

/**
 * Edit Zones lives here, next to the layout it edits.  While output is live on
 * a different scene the operator must switch to it first, so the board never
 * silently enters calibration for a scene nobody asked for.
 */
function renderLayoutAction(): void {
  ui.layoutNormal.replaceChildren();
  if (zoneEditNeedsSwitch()) {
    const target = selectedScene();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'small-button';
    button.textContent = `Switch to ${target.name}`;
    button.addEventListener('click', () => activateScene(target.id));
    const note = document.createElement('span');
    note.className = 'muted detail';
    note.textContent = `The board is live on ${activeScene().name}.`;
    ui.layoutNormal.append(button, note);
    return;
  }
  ui.layoutNormal.append(ui.sceneEdit);
  ui.sceneEdit.disabled = false;
}

function renderOutput(): void {
  renderScenes();
  const display = findById(displays, selectedDisplayId);
  const width = display?.width ?? 1920;
  const height = display?.height ?? 1080;
  const scene = editorScene();
  const rects = resolveZoneRects(scene.layout, width, height);
  const previewHeight = Math.max(120, Math.round((640 * height) / Math.max(1, width)));
  ui.layoutPreview.style.height = `${Math.min(240, previewHeight)}px`;
  renderLayoutPreview(ui.layoutPreview, {
    layout: scene.layout,
    outputWidth: width,
    outputHeight: height,
    editing: zoneEditSession !== null,
    selectedZoneId: zoneEditSession?.selectedZoneId ?? null,
    showSafeAreas: zoneEditSession?.showSafeAreas ?? false,
    onSelectZone: (zoneId) => {
      if (!zoneEditSession) return;
      zoneEditSession = selectEditZone(zoneEditSession, zoneId);
      renderOutput();
      sendLayoutEditPreview();
    },
    onRatioPreview: previewDividerRatio,
    onRatioCommit: commitDividerRatio,
  });
  ui.layoutDetail.textContent = `${width} × ${height} · ${rects
    .map((rect) => `${zoneRoleLabel(rect.role)} ${rect.width}×${rect.height}`)
    .join(' · ')}`;
  renderZoneEditor(scene);

  const current = team();
  ui.outputGroup.replaceChildren();
  if (current) {
    for (const group of current.groups) {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      ui.outputGroup.append(option);
    }
    const groupId = liveGroupId(scene);
    if (groupId) ui.outputGroup.value = groupId;
  } else {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No team loaded';
    ui.outputGroup.append(option);
  }
  ui.outputBackground.value = scene.background.kind;
  ui.outputStart.hidden = output.active;
  ui.outputStop.hidden = !output.active;
  ui.outputStart.disabled = selectedDisplayId === null || output.active;
  ui.outputStart.textContent = `Start Output · ${selectedScene().name}`;
  ui.outputStop.disabled = !output.active;
  ui.displaySelect.disabled = output.active;
  updateGlobalStatus();
}

async function refreshDisplays(): Promise<DisplayInfo[]> {
  try {
    const next = await ipc.listDisplays();
    if (!topologyEquals(next, displays)) {
      displays = next;
      if (!output.active) renderDisplays();
    }
    return next;
  } catch {
    return displays;
  }
}

async function watchTick(): Promise<void> {
  const next = await refreshDisplays();
  if (
    output.active &&
    (!selectedDisplayId || !next.some((display) => display.id === selectedDisplayId))
  ) {
    lostDisplayHint = prefs.displayHint;
    output.abandon();
    await ipc.closePresentation().catch(() => undefined);
    selectedDisplayId = null;
    renderDisplays();
    setMessage('Output display disconnected. Choose the same display to resume.');
  } else if (!output.active && lostDisplayHint) {
    const match = matchDisplay(lostDisplayHint, next);
    if (match.confidence === 'exact' && match.display) {
      selectedDisplayId = match.display.id;
      renderDisplays();
      setMessage('The previous output display is available again.');
    }
  }
}

function startWatching(): void {
  if (watchHandle !== null) window.clearInterval(watchHandle);
  watchHandle = window.setInterval(() => void watchTick(), output.active ? 1500 : 5000);
}

async function startOutput(): Promise<void> {
  if (busy || output.active) return;
  if (!selectedDisplayId) {
    setMessage('Choose a display first.');
    return;
  }
  busy = true;
  try {
    const currentDisplays = await refreshDisplays();
    const display = findById(currentDisplays, selectedDisplayId);
    if (!display) {
      setMessage('That display is no longer connected.');
      return;
    }
    const scene = selectedScene();
    const valid = validateLayout(scene.layout);
    if (!valid.ok) {
      setMessage(valid.message);
      return;
    }
    output.resetReady();
    const placed = await ipc.openPresentation(display.id);
    prefs = { ...prefs, displayHint: hintFor(placed) };
    writePrefs(prefs);
    lostDisplayHint = null;
    const settings = {
      intervalSeconds: mediaSet().imageDurationSeconds,
      transition: mediaSet().transition,
      imageSizing: mediaSet().imageSizing,
      layout: scene.layout,
    };
    selectedSceneId = scene.id;
    activeSceneId = scene.id;
    output.setTheme(outputTheme(scene));
    const started = await output.begin(mediaSet(), settings, liveBoardData(scene));
    if (!started) {
      activeSceneId = null;
      setMessage('No usable media could be started.');
      return;
    }
    renderOutput();
    startWatching();
  } catch (error) {
    setMessage(String(error));
  } finally {
    busy = false;
  }
}

function stopOutput(): void {
  zoneEditSession = null;
  manualSession = null;
  activeSceneId = null;
  selectedSceneId = show.data.defaultSceneId;
  output.stop('user');
  void ipc.closePresentation().catch(() => undefined);
  renderOutput();
  startWatching();
}

async function createNewTeam(): Promise<void> {
  const name = window.prompt('Team name:');
  if (!name?.trim()) return;
  const sport = (
    window.prompt(
      'Sport (volleyball, basketball, soccer, football, baseball, softball or custom):',
      'volleyball',
    ) ?? 'volleyball'
  )
    .trim()
    .toLowerCase();
  const allowedSports = new Set([
    'volleyball',
    'basketball',
    'soccer',
    'football',
    'baseball',
    'softball',
    'custom',
  ]);
  const selectedSport = allowedSports.has(sport) ? sport : 'custom';
  const primary = window.prompt('Primary color (#RRGGBB):', '#1b4b36') ?? '#1b4b36';
  const secondary = window.prompt('Secondary color (#RRGGBB):', '#ffffff') ?? '#ffffff';
  const color = (value: string, fallback: string): string =>
    /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
  const data = createTeam(
    name,
    selectedSport,
    color(primary, '#1b4b36'),
    color(secondary, '#ffffff'),
  );
  show.data = {
    ...show.data,
    team: { kind: 'inline', data },
    event: { stats: {}, liveGroups: {} },
  };
  markShowDirty();
  teamFilePath = null;
  teamDirty = true;
  selectedPlayerId = null;
  selectedRosterGroupId = data.groups[0]?.id ?? null;
  selectedLiveGroupId = data.groups[0]?.id ?? null;
  setLiveBoardGroupId(selectedLiveGroupId);
  renderPlayers();
  renderOutput();
  if (output.active) output.setTheme(outputTheme());
  selectTab('players');
}

async function openTeamFile(): Promise<void> {
  const path = await chooseTeamToOpen(prefs.lastDirectory);
  if (!path) return;
  const result = await openTeam(path, style);
  if (!result.ok) {
    await messageDialog(result.message, { title: 'Picta', kind: 'error' });
    return;
  }
  show.data = {
    ...show.data,
    team: { kind: 'file', path, data: result.data },
    event: { stats: {}, liveGroups: {} },
  };
  teamFilePath = path;
  teamDirty = false;
  selectedRosterGroupId = result.data.groups[0]?.id ?? null;
  selectedLiveGroupId = result.data.groups[0]?.id ?? null;
  setLiveBoardGroupId(selectedLiveGroupId);
  markShowDirty();
  renderPlayers();
  renderOutput();
  if (output.active) output.setTheme(outputTheme());
  if (result.missingPaths.length > 0)
    setMessage(
      `${result.missingPaths.length} team media file${result.missingPaths.length === 1 ? '' : 's'} could not be found.`,
    );
  selectTab('players');
  prefs = { ...prefs, lastDirectory: dirname(path, style) };
  writePrefs(prefs);
}

async function newMediaSet(): Promise<void> {
  const data = defaultMediaSet('Inline Media');
  show.data = { ...show.data, media: { kind: 'inline', data } };
  markShowDirty();
  mediaFilePath = null;
  mediaDirty = true;
  renderMedia();
  renderOutput();
}

async function openMediaSetFile(): Promise<void> {
  const path = await chooseMediaSetToOpen(prefs.lastDirectory);
  if (!path) return;
  const result = await openMediaSet(path, style);
  if (!result.ok) {
    await messageDialog(result.message, { title: 'Picta', kind: 'error' });
    return;
  }
  show.data = { ...show.data, media: { kind: 'file', path, data: result.data } };
  mediaFilePath = path;
  mediaDirty = false;
  markShowDirty();
  renderMedia();
  renderOutput();
  if (result.missingPaths.length > 0)
    setMessage(
      `${result.missingPaths.length} media file${result.missingPaths.length === 1 ? '' : 's'} could not be found.`,
    );
  prefs = { ...prefs, lastDirectory: dirname(path, style) };
  writePrefs(prefs);
}

async function saveShow(): Promise<boolean> {
  const path = show.filePath ?? (await chooseShowToSave(prefs.lastDirectory, 'Untitled.picta'));
  if (!path) return false;
  const result = await saveShowDocument(path, show.data, style);
  if (!result.ok) {
    await messageDialog(result.message, { title: 'Picta', kind: 'error' });
    return false;
  }
  show.filePath = path;
  show.dirty = false;
  syncTitle();
  prefs = { ...prefs, lastDirectory: dirname(path, style) };
  writePrefs(prefs);
  return true;
}
async function saveMedia(): Promise<boolean> {
  const data = mediaSet();
  const path =
    mediaFilePath ??
    (await chooseMediaSetToSave(
      prefs.lastDirectory,
      `${data.name.replace(/[^\w.-]+/g, '-')}.pictaset`,
    ));
  if (!path) return false;
  const wasLinked = show.data.media.kind === 'file' && show.data.media.path === path;
  const result = await saveMediaSet(path, data, style);
  if (!result.ok) {
    await messageDialog(result.message, { title: 'Picta', kind: 'error' });
    return false;
  }
  mediaFilePath = path;
  mediaDirty = false;
  show.data = { ...show.data, media: { kind: 'file', path, data } };
  if (!wasLinked) markShowDirty();
  renderMedia();
  return true;
}
async function saveTeamResource(): Promise<boolean> {
  const current = team();
  if (!current) return true;
  const path =
    teamFilePath ??
    (await chooseTeamToSave(
      prefs.lastDirectory,
      `${current.name.replace(/[^\w.-]+/g, '-')}.pictateam`,
    ));
  if (!path) return false;
  const wasLinked = show.data.team?.kind === 'file' && show.data.team.path === path;
  const result = await saveTeam(path, current, style);
  if (!result.ok) {
    await messageDialog(result.message, { title: 'Picta', kind: 'error' });
    return false;
  }
  teamFilePath = path;
  teamDirty = false;
  show.data = { ...show.data, team: { kind: 'file', path, data: current } };
  if (!wasLinked) markShowDirty();
  renderPlayers();
  return true;
}

function askSaveChanges(): Promise<SaveChoice> {
  const names = resourceDirtyNames();
  ui.confirmText.textContent = `You have unsaved changes:\n\n${names.map((name) => `• ${name}`).join('\n')}`;
  ui.confirmDialog.returnValue = 'cancel';
  ui.confirmDialog.showModal();
  return new Promise((resolve) =>
    ui.confirmDialog.addEventListener(
      'close',
      () => {
        const value = ui.confirmDialog.returnValue;
        resolve(value === 'save' || value === 'discard' ? value : 'cancel');
      },
      { once: true },
    ),
  );
}

async function ensureSaved(): Promise<boolean> {
  if (resourceDirtyNames().length === 0) return true;
  const choice = await askSaveChanges();
  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;
  if (mediaDirty && !(await saveMedia())) return false;
  if (teamDirty && !(await saveTeamResource())) return false;
  if (show.dirty && !(await saveShow())) return false;
  return true;
}

async function newShow(): Promise<void> {
  if (!(await ensureSaved())) return;
  stopOutput();
  show = { filePath: null, data: newShowData(), dirty: false };
  mediaFilePath = null;
  mediaDirty = false;
  teamFilePath = null;
  teamDirty = false;
  selectedPlayerId = null;
  selectedSceneId = show.data.defaultSceneId;
  activeSceneId = null;
  zoneEditSession = null;
  manualSession = null;
  syncTitle();
  renderAll();
}

async function openShowFile(path?: string): Promise<void> {
  if (!(await ensureSaved())) return;
  const target = path ?? (await chooseShowToOpen(prefs.lastDirectory));
  if (!target) return;
  stopOutput();
  const result = await openShowDocument(target, style);
  if (!result.ok) {
    await messageDialog(result.message, { title: 'Picta', kind: 'error' });
    return;
  }
  show = { filePath: target, data: result.data, dirty: false };
  mediaFilePath = result.data.media.kind === 'file' ? result.data.media.path : null;
  mediaDirty = false;
  teamFilePath = result.data.team?.kind === 'file' ? result.data.team.path : null;
  teamDirty = false;
  selectedRosterGroupId = result.data.team?.data?.groups[0]?.id ?? null;
  selectedLiveGroupId = result.data.team?.data?.groups[0]?.id ?? null;
  selectedSceneId = result.data.defaultSceneId;
  activeSceneId = null;
  zoneEditSession = null;
  manualSession = null;
  syncTitle();
  renderAll();
  prefs = { ...prefs, lastDirectory: dirname(target, style) };
  writePrefs(prefs);
  if (result.migratedFromV1) setMessage('Opened a v1 show. Save it to write the new v2 format.');
  else if (result.missingResources.length > 0)
    setMessage(
      `Could not load ${result.missingResources
        .map((resource) => basename(resource.path, style))
        .join(
          ' and ',
        )}. Open it from the ${result.missingResources.some((resource) => resource.kind === 'team') ? 'Players' : 'Media'} tab to relink it.`,
    );
  else if (result.missingCount > 0)
    setMessage(
      `${result.missingCount} media file${result.missingCount === 1 ? '' : 's'} could not be found.`,
    );
  if (team()) selectTab('players');
}

function renderAll(): void {
  renderMedia();
  renderPlayers();
  renderDisplays();
  renderOutput();
}

async function checkForUpdate(force = false): Promise<void> {
  if (
    !force &&
    !shouldCheckNow(
      {
        enabled: prefs.updateChecks,
        lastCheck: prefs.lastUpdateCheck,
        dismissedVersion: prefs.dismissedVersion,
      },
      Date.now(),
      { running: output.active },
    )
  )
    return;
  const status = await ipc.checkForUpdate();
  prefs = { ...prefs, lastUpdateCheck: Date.now() };
  writePrefs(prefs);
  if (!status || !shouldNotify(status, prefs.dismissedVersion)) return;
  ui.updateText.textContent = updateNoticeText(status);
  ui.updateNotice.hidden = false;
}

function wire(): void {
  for (let index = 0; index < ui.tabs.length; index += 1) {
    const tab = ui.tabs[index] as HTMLButtonElement;
    tab.addEventListener('click', () =>
      selectTab(['media', 'players', 'output'][index] as TabName),
    );
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = event.key === 'ArrowRight' ? (index + 1) % 3 : (index + 2) % 3;
      selectTab(['media', 'players', 'output'][next] as TabName);
      (ui.tabs[next] as HTMLButtonElement).focus();
    });
  }
  ui.rosterViewTab.addEventListener('click', () => setPlayerView('roster'));
  ui.liveViewTab.addEventListener('click', () => setPlayerView('live'));
  ui.mediaDropzone.addEventListener(
    'click',
    () => void chooseMedia(prefs.lastDirectory).then(addMedia),
  );
  ui.mediaClear.addEventListener('click', () => updateMedia({ ...mediaSet(), items: [] }));
  ui.mediaLocate.addEventListener('click', () => void locateMedia());
  ui.mediaPrevious.addEventListener('click', () => output.previous());
  ui.mediaNext.addEventListener('click', () => output.next());
  ui.mediaDuration.addEventListener('change', () => {
    const value = Number(ui.mediaDuration.value);
    if (Number.isFinite(value) && value > 0)
      updateMedia({ ...mediaSet(), imageDurationSeconds: value });
  });
  ui.mediaTransition.addEventListener('change', () => {
    const value = ui.mediaTransition.value;
    if (value === 'none' || value === 'crossfade')
      updateMedia({ ...mediaSet(), transition: value });
  });
  ui.mediaSizing.addEventListener('change', () => {
    const value = ui.mediaSizing.value;
    if (value === 'fit' || value === 'fill') updateMedia({ ...mediaSet(), imageSizing: value });
  });
  need<HTMLButtonElement>('media-new-set').addEventListener('click', () => void newMediaSet());
  need<HTMLButtonElement>('media-open-set').addEventListener(
    'click',
    () => void openMediaSetFile(),
  );
  need<HTMLButtonElement>('media-save-set').addEventListener('click', () => void saveMedia());
  need<HTMLButtonElement>('media-save-set-as').addEventListener('click', () => {
    mediaFilePath = null;
    void saveMedia();
  });
  need<HTMLButtonElement>('media-reveal-set').addEventListener('click', () => {
    if (mediaFilePath)
      void ipc.revealPath(mediaFilePath).catch((error) => setMessage(String(error)));
    else setMessage('Save this media set first to reveal it.');
  });
  need<HTMLButtonElement>('team-new').addEventListener('click', () => void createNewTeam());
  need<HTMLButtonElement>('team-new-menu').addEventListener('click', () => void createNewTeam());
  need<HTMLButtonElement>('team-open').addEventListener('click', () => void openTeamFile());
  need<HTMLButtonElement>('team-open-menu').addEventListener('click', () => void openTeamFile());
  need<HTMLButtonElement>('team-save').addEventListener('click', () => void saveTeamResource());
  need<HTMLButtonElement>('team-save-as').addEventListener('click', () => {
    teamFilePath = null;
    void saveTeamResource();
  });
  need<HTMLButtonElement>('team-reveal').addEventListener('click', () => {
    if (teamFilePath) void ipc.revealPath(teamFilePath).catch((error) => setMessage(String(error)));
    else setMessage('Save this team first to reveal it.');
  });
  need<HTMLButtonElement>('team-locate').addEventListener('click', () => void locateTeamMedia());
  ui.groupSelect.addEventListener('change', () => {
    selectedRosterGroupId = ui.groupSelect.value || null;
    renderPlayers();
  });
  ui.liveGroupSelect.addEventListener('change', () => {
    selectedLiveGroupId = ui.liveGroupSelect.value || null;
    setLiveBoardGroupId(selectedLiveGroupId);
    markShowDirty();
    renderPlayers();
    renderOutput();
    updateOutputBoard();
  });
  ui.addPlayer.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!ui.newName.value.trim()) return;
    const current = team();
    if (!current) return;
    const player = makePlayer(ui.newNumber.value, ui.newName.value, ui.newPosition.value);
    updateTeam(addPlayer(current, player));
    selectedPlayerId = player.id;
    ui.newNumber.value = '';
    ui.newName.value = '';
    ui.newPosition.value = '';
  });
  ui.displaySelect.addEventListener('change', () => {
    if (output.active) return;
    selectedDisplayId = ui.displaySelect.value || null;
    const display = findById(displays, selectedDisplayId);
    if (display) {
      prefs = { ...prefs, displayHint: hintFor(display) };
      writePrefs(prefs);
    }
    renderDisplays();
  });
  ui.identify.addEventListener(
    'click',
    () => void ipc.identifyDisplays().catch((error) => setMessage(String(error))),
  );
  ui.sceneNew.addEventListener('click', () => void newSceneFromMenu());
  ui.sceneDuplicate.addEventListener('click', () => void duplicateSceneFromMenu());
  ui.sceneRename.addEventListener('click', () => void renameSceneFromMenu());
  ui.sceneDelete.addEventListener('click', () => void deleteSceneFromMenu());
  ui.sceneDefault.addEventListener('click', () => {
    closeSceneMenu();
    applySceneSet(setDefaultScene(sceneSet(), selectedScene().id));
  });
  ui.sceneMoveLeft.addEventListener('click', () => {
    closeSceneMenu();
    applySceneSet(moveScene(sceneSet(), selectedScene().id, -1));
  });
  ui.sceneMoveRight.addEventListener('click', () => {
    closeSceneMenu();
    applySceneSet(moveScene(sceneSet(), selectedScene().id, 1));
  });
  ui.sceneEdit.addEventListener('click', () => beginZonesEdit());
  ui.zoneEditCancel.addEventListener('click', () => cancelZonesEdit());
  ui.zoneEditDone.addEventListener('click', () => doneZonesEdit());
  ui.zoneEditSafe.addEventListener('change', () => {
    if (!zoneEditSession) return;
    // Preview only: the toggle is never persisted with the scene.
    zoneEditSession = setEditSafeAreas(zoneEditSession, ui.zoneEditSafe.checked);
    renderOutput();
    sendLayoutEditPreview();
  });
  ui.customZoneSelect.addEventListener('change', () => {
    if (!zoneEditSession) return;
    zoneEditSession = selectEditZone(zoneEditSession, ui.customZoneSelect.value);
    renderOutput();
    sendLayoutEditPreview();
  });
  ui.splitColumns.addEventListener('click', () => {
    const id = ui.customZoneSelect.value;
    if (!zoneEditSession || !id) return;
    setDraftLayoutChecked(
      splitZone(editorScene().layout, id, 'columns', id === 'program' ? 'live-board' : 'blank'),
      'That split would leave too many zones.',
    );
  });
  ui.splitRows.addEventListener('click', () => {
    const id = ui.customZoneSelect.value;
    if (!zoneEditSession || !id) return;
    setDraftLayoutChecked(
      splitZone(editorScene().layout, id, 'rows', 'blank'),
      'That split would leave too many zones.',
    );
  });
  ui.customRoleSelect.addEventListener('change', () => {
    const id = ui.customZoneSelect.value;
    const role = ui.customRoleSelect.value;
    if (!zoneEditSession || !id) return;
    if (!['program', 'live-board', 'media', 'blank'].includes(role)) return;
    setDraftLayoutChecked(
      setZoneRole(editorScene().layout, id, role as ZoneRole),
      'A layout must keep exactly one Program zone.',
    );
  });
  ui.mergeZone.addEventListener('click', () => {
    const id = ui.customZoneSelect.value;
    if (!zoneEditSession || !id) return;
    setDraftLayoutChecked(
      mergeZone(editorScene().layout, id),
      'That merge would remove the only Program zone.',
    );
  });
  ui.outputGroup.addEventListener('change', () => {
    setLiveBoardGroupId(ui.outputGroup.value || null);
    selectedLiveGroupId = ui.outputGroup.value || null;
    markShowDirty();
    renderOutput();
    updateOutputBoard();
  });
  ui.outputBackground.addEventListener('change', () => {
    const value = ui.outputBackground.value;
    if (value === 'black' || value === 'primary' || value === 'secondary') {
      const scene = updateSelectedScene((current) => ({ ...current, background: { kind: value } }));
      if (output.active && scene.id === activeSceneId) output.setTheme(outputTheme(scene));
      renderOutput();
    }
  });
  ui.outputStart.addEventListener('click', () => void startOutput());
  ui.outputStop.addEventListener('click', () => stopOutput());
  ui.cuePrevious.addEventListener('click', () => output.previousCue());
  ui.cueNext.addEventListener('click', () => output.nextCue());
  ui.cueEnd.addEventListener('click', () => cancelActiveCue());
  ui.updateOpen.addEventListener(
    'click',
    () => void ipc.openReleasesPage().catch(() => setMessage('Could not open the browser.')),
  );
  void listen<{ key: string }>(EVENT_KEY, (event) => {
    if (!output.active) return;
    if (event.payload.key === 'Escape') {
      if (output.cueActive) cancelActiveCue();
      else stopOutput();
    } else if (event.payload.key === 'ArrowLeft') output.previous();
    else if (event.payload.key === 'ArrowRight' || event.payload.key === ' ') output.next();
  });
  void listen<string>(EVENT_MENU, (event) => {
    if (event.payload === 'new') void newShow();
    else if (event.payload === 'open') void openShowFile();
    else if (event.payload === 'save') void saveShow();
    else if (event.payload === 'save-as') {
      show.filePath = null;
      void saveShow();
    } else if (event.payload === 'check-updates') void checkForUpdate(true);
  });
  window.addEventListener('keydown', (event) => {
    if (
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      (event.target as HTMLElement | null)?.matches('input, textarea, select')
    )
      return;
    if (!output.active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (output.cueActive) cancelActiveCue();
      else stopOutput();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      if (event.key === 'ArrowLeft') output.previous();
      else output.next();
    }
  });
  void getCurrentWebviewWindow().onDragDropEvent((event) => {
    if (event.payload.type !== 'drop') return;
    const paths = event.payload.paths;
    const showPath = paths.find((path) => /\.picta$/i.test(path));
    const setPath = paths.find((path) => /\.pictaset$/i.test(path));
    const teamPath = paths.find((path) => /\.pictateam$/i.test(path));
    if (showPath) void openShowFile(showPath);
    else if (activeTab === 'media' && setPath)
      void (async () => {
        const result = await openMediaSet(setPath, style);
        if (result.ok) {
          show.data = { ...show.data, media: { kind: 'file', path: setPath, data: result.data } };
          mediaFilePath = setPath;
          mediaDirty = false;
          markShowDirty();
          renderAll();
        }
      })();
    else if (activeTab === 'players' && teamPath)
      void (async () => {
        const result = await openTeam(teamPath, style);
        if (result.ok) {
          show.data = {
            ...show.data,
            team: { kind: 'file', path: teamPath, data: result.data },
            event: { stats: {}, liveGroups: {} },
          };
          teamFilePath = teamPath;
          teamDirty = false;
          markShowDirty();
          renderAll();
        }
      })();
    else if (activeTab === 'media') void addMedia(paths);
  });
  void appWindow.onCloseRequested(async (event) => {
    event.preventDefault();
    stopOutput();
    if (!(await ensureSaved())) return;
    await persistWindow();
    await ipc.closePresentation().catch(() => undefined);
    await ipc.quitApp().catch(() => undefined);
  });
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
    /* optional */
  }
  await flushPrefs(prefs);
}

async function main(): Promise<void> {
  style = await ipc
    .pathStyle()
    .catch(() => (navigator.userAgent.includes('Windows') ? 'win32' : 'posix'));
  prefs = await readPrefs();
  await output.init();
  wire();
  const available = await ipc.listDisplays().catch(() => [] as DisplayInfo[]);
  displays = available;
  if (prefs.window) {
    try {
      await appWindow.setSize(new PhysicalSize(prefs.window.width, prefs.window.height));
      if (
        available.some(
          (display) =>
            prefs.window &&
            prefs.window.x + 80 >= display.x &&
            prefs.window.y + 40 >= display.y &&
            prefs.window.x < display.x + display.width &&
            prefs.window.y < display.y + display.height,
        )
      )
        await appWindow.setPosition(new PhysicalPosition(prefs.window.x, prefs.window.y));
    } catch {
      /* default geometry */
    }
  }
  renderAll();
  selectTab('media');
  const startup = await ipc.startupFile().catch(() => null);
  if (startup) await openShowFile(startup);
  await appWindow.show();
  await appWindow.setFocus();
  startWatching();
  void checkForUpdate();
}

void main().catch((error: unknown) => setMessage(`Picta could not start: ${String(error)}`));
