/** Picta controller: a small desktop utility for media, optional teams and output. */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { convertFileSrc, isTauri } from '@tauri-apps/api/core';
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
import { askConfirm, askCustomStat, askText } from './app/dialogs.js';
import { renderManualWorkspace } from './app/manual-presentation.js';
import { renderLayoutPreview, renderZoneSelect, type LayoutPath } from './app/layout-editor.js';
import { emptyPrefs, flushPrefs, readPrefs, writePrefs, type Prefs } from './app/prefs.js';
import {
  chooseFolder,
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
  PAGE_NAMES,
  pageFromHash,
  pageHash,
  renderPage,
  type PageName,
} from './app/page-navigation.js';
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
import { basename, dirname, resolvePath, type PathStyle } from './core/paths.js';
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
  navItems: [...document.querySelectorAll<HTMLButtonElement>('.nav-item[data-page]')],
  workspace: need<HTMLElement>('page-home').parentElement as HTMLElement,
  saveState: need<HTMLElement>('save-state'),
  headerOutput: need<HTMLButtonElement>('header-output'),
  homePrimaryAction: need<HTMLButtonElement>('home-primary-action'),
  homeShowTitle: need<HTMLElement>('show-overview-title'),
  homeShowStatus: need<HTMLElement>('home-show-status'),
  homeMediaSummary: need<HTMLElement>('home-media-summary'),
  homeSceneSummary: need<HTMLElement>('home-scene-summary'),
  homeDisplaySummary: need<HTMLElement>('home-display-summary'),
  homeLiveSummary: need<HTMLElement>('home-live-summary'),
  homeMediaCount: need<HTMLElement>('home-media-count'),
  homeTeamSummary: need<HTMLElement>('home-team-summary'),
  homeScenesCount: need<HTMLElement>('home-scenes-count'),
  sceneStrip: need<HTMLElement>('scene-strip'),
  sceneButtons: need<HTMLDivElement>('scene-buttons'),
  scenePicker: need<HTMLDivElement>('scene-picker'),
  sceneCurrent: need<HTMLParagraphElement>('scene-current'),
  sceneHint: need<HTMLParagraphElement>('scene-hint'),
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
  message: need<HTMLParagraphElement>('message'),
  mediaResourceName: need<HTMLParagraphElement>('media-resource-name'),
  mediaDropzone: need<HTMLButtonElement>('media-dropzone'),
  mediaList: need<HTMLDivElement>('media-list'),
  mediaEmpty: need<HTMLDivElement>('media-empty'),
  mediaCount: need<HTMLParagraphElement>('media-count'),
  mediaClear: need<HTMLButtonElement>('media-clear'),
  mediaMissing: need<HTMLDivElement>('media-missing'),
  mediaMissingText: need<HTMLParagraphElement>('media-missing-text'),
  mediaLocate: need<HTMLButtonElement>('media-locate'),
  mediaDuration: need<HTMLSelectElement>('media-duration'),
  mediaTransition: need<HTMLSelectElement>('media-transition'),
  mediaSizing: need<HTMLSelectElement>('media-sizing'),
  mediaTransport: need<HTMLDivElement>('media-transport'),
  mediaPrevious: need<HTMLButtonElement>('media-previous'),
  mediaNext: need<HTMLButtonElement>('media-next'),
  noTeam: need<HTMLDivElement>('no-team'),
  teamLoaded: need<HTMLDivElement>('team-loaded'),
  teamName: need<HTMLElement>('team-name'),
  teamDetail: need<HTMLParagraphElement>('team-detail'),
  teamFileName: need<HTMLParagraphElement>('team-file-name'),
  customSportEditor: need<HTMLDivElement>('custom-sport-editor'),
  teamMenu: need<HTMLDetailsElement>('team-menu'),
  rosterView: need<HTMLDivElement>('roster-view'),
  rosterSetup: need<HTMLDivElement>('roster-setup'),
  liveEmpty: need<HTMLDivElement>('live-empty'),
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
  layoutPresetsHint: need<HTMLParagraphElement>('layout-presets-hint'),
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
  outputStateBadge: need<HTMLDivElement>('output-state-badge'),
  outputSceneName: need<HTMLElement>('output-scene-name'),
  outputMiniPreview: need<HTMLDivElement>('output-mini-preview'),
  outputMediaReadiness: need<HTMLElement>('output-media-readiness'),
  outputTeamReadiness: need<HTMLElement>('output-team-readiness'),
  outputDisplayReadiness: need<HTMLElement>('output-display-readiness'),
  outputActionTitle: need<HTMLElement>('output-action-title'),
  outputActionCopy: need<HTMLElement>('output-action-copy'),
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
  updateDismiss: need<HTMLButtonElement>('update-dismiss'),
  teamDialog: need<HTMLDialogElement>('team-dialog'),
  teamDialogForm: need<HTMLFormElement>('team-dialog-form'),
  teamDialogName: need<HTMLInputElement>('team-dialog-name'),
  teamDialogSport: need<HTMLSelectElement>('team-dialog-sport'),
  teamDialogPrimary: need<HTMLInputElement>('team-dialog-primary'),
  teamDialogSecondary: need<HTMLInputElement>('team-dialog-secondary'),
  teamDialogError: need<HTMLParagraphElement>('team-dialog-error'),
  teamDialogCancel: need<HTMLButtonElement>('team-dialog-cancel'),
  textDialog: need<HTMLDialogElement>('text-dialog'),
  textDialogForm: need<HTMLFormElement>('text-dialog-form'),
  textDialogKicker: need<HTMLElement>('text-dialog-kicker'),
  textDialogTitle: need<HTMLElement>('text-dialog-title'),
  textDialogLabel: need<HTMLElement>('text-dialog-label'),
  textDialogInput: need<HTMLInputElement>('text-dialog-input'),
  textDialogError: need<HTMLParagraphElement>('text-dialog-error'),
  textDialogConfirm: need<HTMLButtonElement>('text-dialog-confirm'),
  actionDialog: need<HTMLDialogElement>('action-dialog'),
  actionDialogKicker: need<HTMLElement>('action-dialog-kicker'),
  actionDialogTitle: need<HTMLElement>('action-dialog-title'),
  actionDialogText: need<HTMLParagraphElement>('action-dialog-text'),
  actionDialogConfirm: need<HTMLButtonElement>('action-dialog-confirm'),
  statDialog: need<HTMLDialogElement>('stat-dialog'),
  statDialogForm: need<HTMLFormElement>('stat-dialog-form'),
  statDialogLabel: need<HTMLInputElement>('stat-dialog-label'),
  statDialogId: need<HTMLInputElement>('stat-dialog-id'),
  statDialogShort: need<HTMLInputElement>('stat-dialog-short'),
  statDialogError: need<HTMLParagraphElement>('stat-dialog-error'),
};

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
let activePage: PageName = pageFromHash(window.location.hash);
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
let offeredUpdateVersion: string | null = null;

const appWindow = isTauri() ? getCurrentWindow() : null;

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
  void appWindow?.setTitle(`${show.dirty ? '• ' : ''}${name} — Picta`);
  const dirtyCount = resourceDirtyNames().length;
  ui.saveState.textContent = dirtyCount > 0 ? `${name} · unsaved` : `${name} show`;
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
  renderSummaries();
}

function applySceneSet(next: SceneSet): void {
  show.data = { ...show.data, ...next };
  markShowDirty();
  renderOutput();
}

async function newSceneFromMenu(): Promise<void> {
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

function textDialogElements() {
  return {
    dialog: ui.textDialog,
    form: ui.textDialogForm,
    kicker: ui.textDialogKicker,
    title: ui.textDialogTitle,
    label: ui.textDialogLabel,
    input: ui.textDialogInput,
    error: ui.textDialogError,
    confirm: ui.textDialogConfirm,
  };
}

function actionDialogElements() {
  return {
    dialog: ui.actionDialog,
    kicker: ui.actionDialogKicker,
    title: ui.actionDialogTitle,
    text: ui.actionDialogText,
    confirm: ui.actionDialogConfirm,
  };
}

function statDialogElements() {
  return {
    dialog: ui.statDialog,
    form: ui.statDialogForm,
    label: ui.statDialogLabel,
    id: ui.statDialogId,
    shortLabel: ui.statDialogShort,
    error: ui.statDialogError,
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
  // Done, Cancel and the zone tools all live on the Scenes page. Never leave
  // the board in calibration mode with no visible way out.
  if (activePage !== 'scenes') selectPage('scenes');
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
    renderMedia();
    renderPlayers();
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

type HistoryMode = 'push' | 'replace' | 'none';

function selectPage(page: PageName, historyMode: HistoryMode = 'push'): void {
  const changed = activePage !== page;
  activePage = page;
  renderPage(document, page);
  if (historyMode === 'replace') history.replaceState({ page }, '', pageHash(page));
  else if (historyMode === 'push' && (changed || window.location.hash !== pageHash(page)))
    history.pushState({ page }, '', pageHash(page));
  ui.headerOutput.disabled = page === 'output';
  ui.headerOutput.textContent = page === 'output' ? 'Output open' : 'Open output';
  if (changed) ui.workspace.scrollTo({ top: 0, behavior: 'instant' });
  if (changed && page === 'live') {
    const current = team();
    if (current) renderLive(current);
  }
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function renderSummaries(): void {
  const media = mediaSet();
  const usableMedia = media.items.filter((item) => !item.missing).length;
  const currentTeam = team();
  const scene = selectedScene();
  const display = findById(displays, selectedDisplayId);
  const hasBoard = layoutZones(scene.layout).some((zone) => zone.role === 'live-board');
  const boardReady = currentTeam !== undefined && liveGroupId(scene) !== null;
  const showName = show.filePath
    ? basename(show.filePath, style).replace(/\.picta$/i, '')
    : 'Untitled';
  ui.saveState.textContent =
    resourceDirtyNames().length > 0 ? `${showName} · unsaved` : `${showName} show`;
  ui.homeShowTitle.textContent = showName;
  ui.homeShowStatus.textContent = output.active
    ? `On air · ${display ? displayLabel(display) : 'Output'}`
    : 'Not on air';

  ui.homePrimaryAction.textContent = media.items.length === 0 ? 'Add media' : 'Review media';
  ui.homeMediaSummary.textContent =
    media.items.length === 0
      ? 'No media yet'
      : `${countLabel(usableMedia, 'file')} ready${usableMedia < media.items.length ? ` · ${media.items.length - usableMedia} missing` : ''}`;
  ui.homeSceneSummary.textContent = `${scene.name} · ${layoutZones(scene.layout).length} zone${layoutZones(scene.layout).length === 1 ? '' : 's'}`;
  ui.homeDisplaySummary.textContent = display ? displayLabel(display) : 'No display selected';
  ui.homeLiveSummary.textContent = output.active
    ? `Live on ${display ? displayLabel(display) : 'output'}`
    : display
      ? 'Ready to start'
      : 'Waiting for a display';
  ui.homeMediaCount.textContent = countLabel(media.items.length, 'item');
  ui.homeTeamSummary.textContent = currentTeam
    ? `${currentTeam.name} · ${countLabel(currentTeam.players.length, 'player')}`
    : 'Not loaded';
  ui.homeScenesCount.textContent = countLabel(show.data.scenes.length, 'scene');

  ui.outputStateBadge.textContent = output.active ? 'ON AIR' : 'OFF AIR';
  ui.outputStateBadge.classList.toggle('live', output.active);
  ui.outputSceneName.textContent = scene.name;
  ui.outputMiniPreview.textContent = `${layoutZones(scene.layout).length} zone${layoutZones(scene.layout).length === 1 ? '' : 's'} · ${layoutPresetId(scene.layout) === 'custom' ? 'Custom' : 'Preset'}`;
  ui.outputMediaReadiness.textContent =
    usableMedia === 0 ? 'None' : countLabel(usableMedia, 'item');
  ui.outputTeamReadiness.textContent = hasBoard
    ? boardReady
      ? (currentTeam?.name ?? 'Ready')
      : 'Team required'
    : 'Not used';
  ui.outputDisplayReadiness.textContent = display ? displayLabel(display) : 'Not selected';
  if (output.active) {
    ui.outputActionTitle.textContent = 'Output active';
    ui.outputActionCopy.textContent = `${scene.name} · ${display ? displayLabel(display) : 'Output display'}`;
  } else if (!display) {
    ui.outputActionTitle.textContent = 'No display selected';
    ui.outputActionCopy.textContent = 'Select an output display.';
  } else {
    ui.outputActionTitle.textContent = 'Ready';
    ui.outputActionCopy.textContent = `${scene.name} · ${displayLabel(display)}`;
  }
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
    row.draggable = true;
    row.dataset['mediaId'] = item.id;
    row.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('application/x-picta-media', item.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes('application/x-picta-media')) return;
      event.preventDefault();
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (event) => {
      const sourceId = event.dataTransfer?.getData('application/x-picta-media');
      const from = data.items.findIndex((candidate) => candidate.id === sourceId);
      row.classList.remove('drag-over');
      if (from < 0 || from === index) return;
      event.preventDefault();
      updateMedia({ ...data, items: moveMediaItem(data.items, from, index) });
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      for (const candidate of ui.mediaList.querySelectorAll('.drag-over'))
        candidate.classList.remove('drag-over');
    });
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
  ui.mediaEmpty.hidden = data.items.length !== 0;
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
  // Previous/Next drive the live program; off air they are a pair of dead
  // buttons on a page the operator uses to prepare.
  ui.mediaTransport.hidden = !output.active;
  ui.mediaPrevious.disabled = !output.active;
  ui.mediaNext.disabled = !output.active;
  renderSummaries();
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
  const folder = await chooseFolder(prefs.lastDirectory, 'Locate Moved Media');
  if (!folder) return;
  prefs = { ...prefs, lastDirectory: folder };
  writePrefs(prefs);
  const candidates = missing.map((item) => resolvePath(folder, basename(item.path, style), style));
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
  const folder = await chooseFolder(prefs.lastDirectory, 'Locate Moved Team Media');
  if (!folder) return;
  prefs = { ...prefs, lastDirectory: folder };
  writePrefs(prefs);
  const candidates = missing.map((item) => resolvePath(folder, basename(item.path, style), style));
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
    void (async () => {
      const stat = await askCustomStat(statDialogElements(), (id) =>
        custom.stats.some((existing) => existing.id === id),
      );
      if (!stat) return;
      updateCustomSport(current, [
        ...custom.stats.map(({ id: statId, label: statLabel, shortLabel: statShort }) => ({
          id: statId,
          label: statLabel,
          shortLabel: statShort,
        })),
        stat,
      ]);
    })();
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
    void (async () => {
      const name = await askText(textDialogElements(), {
        kicker: 'Presentation',
        title: 'New group',
        label: 'Group name',
        confirmLabel: 'Create group',
        validate: (value) =>
          current.groups.some((item) => item.name.toLocaleLowerCase() === value.toLocaleLowerCase())
            ? 'This team already has a group with that name.'
            : null,
      });
      if (!name) return;
      const next = addGroup(current, makeGroup(name));
      selectedRosterGroupId = next.groups.at(-1)?.id ?? selectedRosterGroupId;
      updateTeam(next);
    })();
  });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'small-button';
  remove.textContent = 'Remove Group';
  remove.disabled = current.groups.length <= 1 || !group;
  if (group)
    remove.addEventListener('click', () => {
      void (async () => {
        const confirmed = await askConfirm(actionDialogElements(), {
          kicker: 'Presentation',
          title: 'Remove group',
          text: `Remove the group “${group.name}”? The players stay on the roster.`,
          confirmLabel: 'Remove group',
          destructive: true,
        });
        if (!confirmed) return;
        const next = removeGroup(current, group.id);
        selectedRosterGroupId = next.groups[0]?.id ?? null;
        updateTeam(next);
      })();
    });
  groupActions.append(play, manual, add, remove);
  ui.groupEditor.append(groupActions);
  if (!group) return;
  for (let index = 0; index < group.playerIds.length; index += 1) {
    const player = current.players.find((item) => item.id === group.playerIds[index]);
    if (!player) continue;
    const row = document.createElement('div');
    row.className = 'group-row';
    row.draggable = true;
    row.dataset['playerId'] = player.id;
    row.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('application/x-picta-group-player', player.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes('application/x-picta-group-player')) return;
      event.preventDefault();
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (event) => {
      const sourceId = event.dataTransfer?.getData('application/x-picta-group-player');
      const from = group.playerIds.indexOf(sourceId ?? '');
      row.classList.remove('drag-over');
      if (from < 0 || from === index) return;
      event.preventDefault();
      updateTeam(reorderGroupPlayer(current, group.id, from, index));
    });
    row.addEventListener('dragend', () => {
      for (const candidate of ui.groupEditor.querySelectorAll('.dragging, .drag-over'))
        candidate.classList.remove('dragging', 'drag-over');
    });
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

function reorderRosterPlayer(current: Team, sourceId: string, targetId: string): Team {
  const from = current.players.findIndex((player) => player.id === sourceId);
  const to = current.players.findIndex((player) => player.id === targetId);
  if (from < 0 || to < 0 || from === to) return current;
  const players = current.players.slice();
  const [player] = players.splice(from, 1);
  if (!player) return current;
  players.splice(to, 0, player);
  return { ...current, players };
}

function renderRosterList(current: Team): void {
  ui.rosterList.replaceChildren();
  for (const player of current.players) {
    const row = document.createElement('div');
    row.className = 'roster-row';
    row.tabIndex = 0;
    row.draggable = true;
    row.dataset['playerId'] = player.id;
    row.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('application/x-picta-roster-player', player.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes('application/x-picta-roster-player')) return;
      event.preventDefault();
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (event) => {
      const sourceId = event.dataTransfer?.getData('application/x-picta-roster-player');
      row.classList.remove('drag-over');
      if (!sourceId || sourceId === player.id) return;
      event.preventDefault();
      updateTeam(reorderRosterPlayer(current, sourceId, player.id));
    });
    row.addEventListener('dragend', () => {
      for (const candidate of ui.rosterList.querySelectorAll('.dragging, .drag-over'))
        candidate.classList.remove('dragging', 'drag-over');
    });
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
  ui.liveEmpty.hidden = current !== undefined;
  ui.liveView.hidden = current === undefined;
  if (!current) {
    ui.liveTable.replaceChildren();
    renderSummaries();
    return;
  }
  ui.rosterView.hidden = false;
  renderTeamHeader(current);
  renderCustomSportEditor(current);
  renderGroupEditor(current);
  renderRosterList(current);
  renderInspector(current);
  // The live board is one row per player per statistic; only build it while it
  // is the page being looked at.
  if (activePage === 'live') renderLive(current);
  // Last: a running lineup collapses the setup UI the calls above just drew.
  renderManualSession(current);
  renderSummaries();
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
    renderOutput();
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
const PRESET_NOTES: Record<(typeof LAYOUT_PRESETS)[number], string> = {
  full: 'Program fills the screen',
  'half-half': 'Program and live board',
  'program-2-3': '2/3 program + 1/3 board',
  'board-1-3': '1/3 board + 2/3 program',
};

/**
 * Presets are drawn from the layout module rather than the markup, so the panel
 * can never offer a layout the app does not have.  They stay visible when the
 * scene is not being edited — the operator should see which one this scene uses
 * — but only Edit Zones may change it, because a preset outside the draft would
 * rewrite a saved scene with no way back.
 */
function renderLayoutPresets(layout: LayoutNode): void {
  ui.layoutPresets.replaceChildren();
  const editing = zoneEditSession !== null;
  const current = layoutPresetId(layout);
  for (const id of LAYOUT_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-card';
    const name = document.createElement('strong');
    name.textContent = layoutPresetLabel(id);
    const note = document.createElement('small');
    note.textContent = PRESET_NOTES[id];
    button.append(name, note);
    button.setAttribute('aria-pressed', String(id === current));
    if (id === current) button.classList.add('active');
    button.disabled = !editing;
    // A preset changes the draft only; Cancel still restores the original.
    button.addEventListener('click', () => setDraftLayoutChecked(layoutPreset(id)));
    ui.layoutPresets.append(button);
  }
  ui.layoutPresetsHint.textContent = editing
    ? 'Choosing one replaces the draft. Cancel still restores the scene.'
    : current === 'custom'
      ? 'This scene uses a custom layout. Choose Edit zones to change it.'
      : 'Choose Edit zones to change the layout.';
}

function renderZoneEditor(scene: Scene): void {
  const editing = zoneEditSession !== null;
  ui.layoutHeading.textContent = editing ? `Edit zones — ${scene.name}` : 'Layout preview';
  // The editor replaces the normal layout panel rather than stacking below it.
  ui.layoutNormal.hidden = editing;
  ui.zoneEditPanel.hidden = !editing;
  renderLayoutPresets(scene.layout);
  if (!editing) {
    renderLayoutAction();
    return;
  }
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
  renderSummaries();
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
      // The presentation window is already on the display.  Nothing can start
      // in it and Stop Output is hidden while output is inactive, so close it
      // here rather than stranding a blank window on the wall.
      await ipc.closePresentation().catch(() => undefined);
      renderOutput();
      setMessage('No usable media could be started.');
      return;
    }
    renderMedia();
    renderPlayers();
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
  renderMedia();
  renderPlayers();
  renderOutput();
  startWatching();
}

interface NewTeamDetails {
  name: string;
  sport: string;
  primary: string;
  secondary: string;
}

function askNewTeamDetails(): Promise<NewTeamDetails | null> {
  ui.teamDialogName.value = '';
  ui.teamDialogSport.value = 'volleyball';
  ui.teamDialogPrimary.value = '#1b4b36';
  ui.teamDialogSecondary.value = '#ffffff';
  ui.teamDialogError.hidden = true;
  ui.teamDialog.returnValue = 'cancel';
  ui.teamDialog.showModal();
  window.requestAnimationFrame(() => ui.teamDialogName.focus());
  return new Promise((resolve) => {
    let result: NewTeamDetails | null = null;
    const submit = (event: SubmitEvent) => {
      event.preventDefault();
      const name = ui.teamDialogName.value.trim();
      if (!name) {
        ui.teamDialogError.textContent = 'Enter a team name.';
        ui.teamDialogError.hidden = false;
        ui.teamDialogName.focus();
        return;
      }
      result = {
        name,
        sport: ui.teamDialogSport.value,
        primary: ui.teamDialogPrimary.value,
        secondary: ui.teamDialogSecondary.value,
      };
      ui.teamDialog.close('create');
    };
    const cancel = () => ui.teamDialog.close('cancel');
    const close = () => {
      ui.teamDialogForm.removeEventListener('submit', submit);
      ui.teamDialogCancel.removeEventListener('click', cancel);
      resolve(ui.teamDialog.returnValue === 'create' ? result : null);
    };
    ui.teamDialogForm.addEventListener('submit', submit);
    ui.teamDialogCancel.addEventListener('click', cancel);
    ui.teamDialog.addEventListener('close', close, { once: true });
  });
}

async function createNewTeam(): Promise<void> {
  if (!(await ensureResourceSaved('team'))) return;
  const details = await askNewTeamDetails();
  if (!details) return;
  const data = createTeam(details.name, details.sport, details.primary, details.secondary);
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
  selectPage('roster');
}

async function openTeamFile(): Promise<void> {
  if (!(await ensureResourceSaved('team'))) return;
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
  selectPage('roster');
  prefs = { ...prefs, lastDirectory: dirname(path, style) };
  writePrefs(prefs);
}

async function newMediaSet(): Promise<void> {
  if (!(await ensureResourceSaved('media'))) return;
  const data = defaultMediaSet('Inline Media');
  show.data = { ...show.data, media: { kind: 'inline', data } };
  markShowDirty();
  mediaFilePath = null;
  mediaDirty = true;
  renderMedia();
  renderOutput();
}

async function openMediaSetFile(): Promise<void> {
  if (!(await ensureResourceSaved('media'))) return;
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

function askSaveChanges(names = resourceDirtyNames()): Promise<SaveChoice> {
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

/**
 * Opening a team or a media set replaces the one the show is using.  Offer to
 * save that resource first: replacing it silently threw away every unsaved
 * roster or playlist edit.
 */
async function ensureResourceSaved(kind: 'media' | 'team'): Promise<boolean> {
  const dirty = kind === 'media' ? mediaDirty : teamDirty;
  if (!dirty) return true;
  const filePath = kind === 'media' ? mediaFilePath : teamFilePath;
  const fallback = kind === 'media' ? 'Untitled.pictaset' : 'Untitled.pictateam';
  const choice = await askSaveChanges([filePath ? basename(filePath, style) : fallback]);
  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;
  return kind === 'media' ? saveMedia() : saveTeamResource();
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
        )}. Open it from the ${result.missingResources.some((resource) => resource.kind === 'team') ? 'Roster' : 'Media'} page to relink it.`,
    );
  else if (result.missingCount > 0)
    setMessage(
      `${result.missingCount} media file${result.missingCount === 1 ? '' : 's'} could not be found.`,
    );
  if (team()) selectPage('roster');
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
  offeredUpdateVersion = status.latestVersion;
  ui.updateText.textContent = updateNoticeText(status);
  ui.updateNotice.hidden = false;
}

function wirePageNavigation(): void {
  for (let index = 0; index < ui.navItems.length; index += 1) {
    const item = ui.navItems[index];
    if (!item) continue;
    item.addEventListener('click', () => {
      const page = item.dataset['page'];
      if (page && PAGE_NAMES.includes(page as PageName)) selectPage(page as PageName);
    });
    item.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const next = (index + direction + ui.navItems.length) % ui.navItems.length;
      const nextItem = ui.navItems[next];
      const page = nextItem?.dataset['page'];
      if (nextItem && page && PAGE_NAMES.includes(page as PageName)) {
        selectPage(page as PageName);
        nextItem.focus();
      }
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-go-page]')) {
    button.addEventListener('click', () => {
      const page = button.dataset['goPage'];
      if (page && PAGE_NAMES.includes(page as PageName)) selectPage(page as PageName);
    });
  }
  ui.homePrimaryAction.addEventListener('click', () => selectPage('media'));
  window.addEventListener('popstate', () => selectPage(pageFromHash(window.location.hash), 'none'));
  window.addEventListener('hashchange', () =>
    selectPage(pageFromHash(window.location.hash), 'none'),
  );
}

function wire(): void {
  wirePageNavigation();
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
  ui.sceneDefault.addEventListener('click', () =>
    applySceneSet(setDefaultScene(sceneSet(), selectedScene().id)),
  );
  ui.sceneMoveLeft.addEventListener('click', () =>
    applySceneSet(moveScene(sceneSet(), selectedScene().id, -1)),
  );
  ui.sceneMoveRight.addEventListener('click', () =>
    applySceneSet(moveScene(sceneSet(), selectedScene().id, 1)),
  );
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
  ui.updateDismiss.addEventListener('click', () => {
    if (offeredUpdateVersion) {
      prefs = { ...prefs, dismissedVersion: offeredUpdateVersion };
      writePrefs(prefs);
    }
    offeredUpdateVersion = null;
    ui.updateNotice.hidden = true;
  });
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
    const target = event.target as HTMLElement | null;
    if (
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      target?.matches('input, textarea, select')
    )
      return;
    // A modal dialog owns the keyboard while it is up.  Escape there means
    // "close this dialog", never "stop the output behind it".
    if (document.querySelector('dialog[open]')) return;
    if (!output.active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (output.cueActive) cancelActiveCue();
      else stopOutput();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') {
      // Space activates whatever control has focus.  Taking it globally would
      // make every focused button skip media instead of doing its own job.
      if (event.key === ' ' && target?.closest('button, summary, a[href], [role="button"]')) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') output.previous();
      else output.next();
    }
  });
  void getCurrentWebviewWindow().onDragDropEvent((event) => {
    if (event.payload.type === 'enter' || event.payload.type === 'over') {
      ui.mediaDropzone.classList.toggle('drag-active', activePage === 'media');
      return;
    }
    ui.mediaDropzone.classList.remove('drag-active');
    if (event.payload.type !== 'drop') return;
    const paths = event.payload.paths;
    const showPath = paths.find((path) => /\.picta$/i.test(path));
    const setPath = paths.find((path) => /\.pictaset$/i.test(path));
    const teamPath = paths.find((path) => /\.pictateam$/i.test(path));
    if (showPath) void openShowFile(showPath);
    else if (setPath)
      void (async () => {
        if (!(await ensureResourceSaved('media'))) return;
        const result = await openMediaSet(setPath, style);
        if (result.ok) {
          show.data = { ...show.data, media: { kind: 'file', path: setPath, data: result.data } };
          mediaFilePath = setPath;
          mediaDirty = false;
          markShowDirty();
          renderAll();
          selectPage('media');
        }
      })();
    else if (teamPath)
      void (async () => {
        if (!(await ensureResourceSaved('team'))) return;
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
          selectPage('roster');
        }
      })();
    else if (paths.some(isSupportedMediaPath)) {
      if (activePage !== 'media') selectPage('media');
      void addMedia(paths);
    }
  });
  if (appWindow)
    void appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      if (!(await ensureSaved())) return;
      stopOutput();
      await persistWindow();
      await ipc.closePresentation().catch(() => undefined);
      await ipc.quitApp().catch(() => undefined);
    });
}

async function persistWindow(): Promise<void> {
  if (!appWindow) return;
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
  if (!appWindow) return;
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
  selectPage(activePage, 'replace');
  const startup = await ipc.startupFile().catch(() => null);
  if (startup) await openShowFile(startup);
  await appWindow.show();
  await appWindow.setFocus();
  startWatching();
  void checkForUpdate();
}

// Paint the requested route immediately; native initialization can continue without a blank flash.
renderPage(document, activePage);
if (appWindow) {
  void main().catch((error: unknown) => setMessage(`Picta could not start: ${String(error)}`));
} else {
  // The browser preview is intentionally read-only apart from page navigation.
  renderAll();
  wirePageNavigation();
  selectPage(activePage, 'replace');
}
