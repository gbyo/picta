/**
 * Native document behaviour: New, Open, Save, Save As, linked `.pictaset` and
 * `.pictateam` resources, unsaved-change prompts, crash recovery and quit.
 *
 * Opening anything is "latest wins": a slow open that is overtaken by a newer
 * request can never commit. Nothing is replaced until the replacement has been
 * read, parsed and validated.
 */

import type { MediaSet, ShowDocument, Team } from '@core/domain.js';
import { defaultMediaSet } from '@core/media.js';
import { basename, dirname } from '@core/paths.js';
import { createScoreHistory, defaultVolleyballScore } from '@core/score.js';
import { defaultShowDocument } from '@core/show-file.js';
import { emptyStatLog } from '@core/stat-log.js';
import { createTeam, makeGroup } from '@core/teams.js';
import { makeCustomSport } from '@core/sports.js';
import {
  inlineMediaSession,
  OperationGeneration,
  replaceMediaInSession,
  replaceTeamInSession,
  runLatestOpen,
  sessionFromShow,
  type DocumentSession,
} from '@app/document-lifecycle.js';
import { hasUnsavedWork, type RecoverySnapshot } from '@app/recovery.js';
import { runSaveTransaction } from '@app/save-transaction.js';
import { rt } from '../runtime.js';
import { ask, type NewTeamDetails } from '../state/dialogs.js';
import { anyDirty, defaultLiveGroup, dirtyNames, mediaSetOf, teamOf } from '../state/derive.js';
import { getState, setState, type DocumentState } from '../state/store.js';
import { invalidatePreflight, stopOutput } from './output.js';
import { notify } from './notify.js';
import { clearRecovery } from './sync.js';

const openOperations = new OperationGeneration();

function rememberDirectory(path: string): void {
  const state = getState();
  const prefs = { ...state.prefs, lastDirectory: dirname(path, state.pathStyle) };
  rt().platform.prefs.write(prefs);
  setState({ prefs });
}

/** Replace the whole document and reset everything that belonged to the old one. */
function adopt(doc: DocumentState): void {
  const data = doc.show.data;
  const team = teamOf(data);
  setState({
    doc,
    scoreHistory: createScoreHistory(data.event.score ?? defaultVolleyballScore(team)),
    statLog: emptyStatLog(),
    armedScreenId: data.defaultScreenId,
    manual: null,
    selectedMediaIds: [],
    selectedPlayerId: null,
    selectedGroupId: team?.groups[0]?.id ?? null,
    editingScreenId: null,
    selectedPanelId: null,
    statsGroupId: null,
  });
  invalidatePreflight();
  // Let the controller's previews and the output render this document's
  // media. Opening a show grants this too; recovery and New must as well.
  const paths = [
    ...(data.media.data?.items ?? []).filter((item) => !item.missing).map((item) => item.path),
    ...(team?.players ?? []).flatMap((player) =>
      [player.media.photo, player.media.introVideo]
        .filter((ref) => ref !== undefined && !ref.missing)
        .map((ref) => ref!.path),
    ),
  ];
  if (paths.length > 0)
    void rt()
      .platform.files.allowMedia(paths)
      .catch(() => undefined);
}

function toSession(doc: DocumentState): DocumentSession {
  return doc;
}

async function showError(title: string, message: string): Promise<void> {
  notify.error(title, message);
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export async function saveShow(asNew = false): Promise<boolean> {
  const { platform } = rt();
  const state = getState();
  const style = state.pathStyle;
  const doc = state.doc;
  const suggested = doc.show.filePath ? basename(doc.show.filePath, style) : 'Untitled.picta';
  const data = doc.show.data;
  const outcome = await runSaveTransaction(
    doc.show.filePath,
    asNew,
    () => platform.dialogs.chooseShowToSave(state.prefs.lastDirectory, suggested),
    (path) => platform.files.saveShow(path, data, style),
  );
  if (outcome.status === 'cancelled') return false;
  if (outcome.status === 'failed') {
    await showError(
      'The show could not be saved',
      'message' in outcome.result ? outcome.result.message : '',
    );
    return false;
  }
  setState((s) => ({
    doc: {
      ...s.doc,
      // Edits made while the write was in flight keep the show dirty.
      show: { ...s.doc.show, filePath: outcome.path, dirty: s.doc.show.data !== data },
      // Inline resources were written as part of the show.
      mediaDirty:
        s.doc.show.data.media.kind === 'inline' && s.doc.show.data === data
          ? false
          : s.doc.mediaDirty,
      teamDirty:
        s.doc.show.data.team?.kind !== 'file' && s.doc.show.data === data ? false : s.doc.teamDirty,
    },
  }));
  rememberDirectory(outcome.path);
  notify.info(`Saved ${basename(outcome.path, style)}`);
  return true;
}

export async function saveMedia(asNew = false): Promise<boolean> {
  const { platform } = rt();
  const state = getState();
  const style = state.pathStyle;
  const data = mediaSetOf(state.doc.show.data, style);
  const outcome = await runSaveTransaction(
    state.doc.mediaFilePath,
    asNew,
    () =>
      platform.dialogs.chooseMediaSetToSave(
        state.prefs.lastDirectory,
        `${data.name.replace(/[^\w.-]+/g, '-') || 'Media'}.pictaset`,
      ),
    (path) => platform.files.saveMediaSet(path, data, style),
  );
  if (outcome.status === 'cancelled') return false;
  if (outcome.status === 'failed') {
    await showError(
      'The media set could not be saved',
      'message' in outcome.result ? outcome.result.message : '',
    );
    return false;
  }
  setState((s) => {
    const wasLinked =
      s.doc.show.data.media.kind === 'file' && s.doc.show.data.media.path === outcome.path;
    // Edits made while the dialog or write was in progress stay, and stay unsaved.
    const latest = mediaSetOf(s.doc.show.data, style);
    return {
      doc: {
        ...s.doc,
        mediaFilePath: outcome.path,
        mediaDirty: latest !== data,
        show: {
          ...s.doc.show,
          data: { ...s.doc.show.data, media: { kind: 'file', path: outcome.path, data: latest } },
          dirty: s.doc.show.dirty || !wasLinked,
        },
      },
    };
  });
  rememberDirectory(outcome.path);
  notify.info(`Saved ${basename(outcome.path, style)}`);
  return true;
}

export async function saveTeam(asNew = false): Promise<boolean> {
  const { platform } = rt();
  const state = getState();
  const style = state.pathStyle;
  const team = teamOf(state.doc.show.data);
  if (!team) return true;
  const outcome = await runSaveTransaction(
    state.doc.teamFilePath,
    asNew,
    () =>
      platform.dialogs.chooseTeamToSave(
        state.prefs.lastDirectory,
        `${team.name.replace(/[^\w.-]+/g, '-') || 'Team'}.pictateam`,
      ),
    (path) => platform.files.saveTeam(path, team, style),
  );
  if (outcome.status === 'cancelled') return false;
  if (outcome.status === 'failed') {
    await showError(
      'The team could not be saved',
      'message' in outcome.result ? outcome.result.message : '',
    );
    return false;
  }
  setState((s) => {
    const wasLinked =
      s.doc.show.data.team?.kind === 'file' && s.doc.show.data.team.path === outcome.path;
    const latest = teamOf(s.doc.show.data) ?? team;
    return {
      doc: {
        ...s.doc,
        teamFilePath: outcome.path,
        teamDirty: latest !== team,
        show: {
          ...s.doc.show,
          data: { ...s.doc.show.data, team: { kind: 'file', path: outcome.path, data: latest } },
          dirty: s.doc.show.dirty || !wasLinked,
        },
      },
    };
  });
  rememberDirectory(outcome.path);
  notify.info(`Saved ${basename(outcome.path, style)}`);
  return true;
}

/** Offer to save everything unsaved. Resolves false when the operator cancels. */
export async function ensureSaved(reason: string): Promise<boolean> {
  const state = getState();
  if (!anyDirty(state.doc)) return true;
  const choice = await ask.saveChanges(dirtyNames(state.doc, state.pathStyle), reason);
  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;
  if (getState().doc.mediaDirty && getState().doc.mediaFilePath && !(await saveMedia()))
    return false;
  if (getState().doc.teamDirty && getState().doc.teamFilePath && !(await saveTeam())) return false;
  const doc = getState().doc;
  const showNeedsSave =
    doc.show.dirty ||
    (doc.mediaDirty && !doc.mediaFilePath) ||
    (doc.teamDirty && !doc.teamFilePath);
  if (showNeedsSave && !(await saveShow())) return false;
  return true;
}

/** Replacing a linked resource offers to save that resource first. */
async function ensureResourceSaved(kind: 'media' | 'team'): Promise<boolean> {
  const state = getState();
  const dirty = kind === 'media' ? state.doc.mediaDirty : state.doc.teamDirty;
  if (!dirty) return true;
  const path = kind === 'media' ? state.doc.mediaFilePath : state.doc.teamFilePath;
  const choice = await ask.saveChanges(
    [
      path
        ? basename(path, state.pathStyle)
        : kind === 'media'
          ? 'Media (in show)'
          : 'Team (in show)',
    ],
    kind === 'media' ? 'replacing the media set' : 'replacing the team',
  );
  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;
  return kind === 'media' ? saveMedia() : saveTeam();
}

// ---------------------------------------------------------------------------
// Shows
// ---------------------------------------------------------------------------

export async function newShow(): Promise<void> {
  const operation = openOperations.start();
  if (!(await ensureSaved('starting a new show'))) return;
  if (!openOperations.isCurrent(operation)) return;
  await stopOutput();
  adopt({
    show: { filePath: null, data: defaultShowDocument(), dirty: false },
    mediaFilePath: null,
    mediaDirty: false,
    teamFilePath: null,
    teamDirty: false,
  });
  notify.info('New show');
}

export async function openShow(path?: string): Promise<void> {
  const { platform } = rt();
  const outcome = await runLatestOpen(
    openOperations,
    async () => {
      if (!(await ensureSaved('opening another show'))) return null;
      const target =
        path ?? (await platform.dialogs.chooseShowToOpen(getState().prefs.lastDirectory));
      if (!target) return null;
      return platform.files.openShow(target, getState().pathStyle);
    },
    (result) => result.ok,
    (result) => {
      if (!result.ok) return;
      // The current show and output stay untouched until the replacement has
      // been parsed, hydrated and validated.
      void stopOutput();
      adopt(sessionFromShow(result));
    },
  );
  if (outcome.status === 'failed' && !outcome.value.ok) {
    await showError('That show could not be opened', outcome.value.message);
    return;
  }
  if (outcome.status === 'error') {
    await showError('That show could not be opened', String(outcome.error));
    return;
  }
  if (outcome.status !== 'committed' || !outcome.value.ok) return;
  const result = outcome.value;
  const style = getState().pathStyle;
  rememberDirectory(result.filePath);
  notify.info(`Opened ${basename(result.filePath, style)}`);
  if (result.migratedFromV1)
    notify.warning('This show was made by an older Picta. It will be upgraded when you save it.');
  if (result.missingResources.length > 0)
    notify.warning(
      `Could not load ${result.missingResources.map((item) => basename(item.path, style)).join(' and ')}. Re-open it from ${result.missingResources.some((item) => item.kind === 'team') ? 'Roster' : 'Media'}.`,
    );
  else if (result.missingCount > 0)
    notify.warning(
      `${result.missingCount} media file${result.missingCount === 1 ? '' : 's'} could not be found.`,
    );
}

// ---------------------------------------------------------------------------
// Media sets
// ---------------------------------------------------------------------------

export async function newMediaSet(): Promise<void> {
  const operation = openOperations.start();
  if (getState().output.phase !== 'off') return;
  if (!(await ensureResourceSaved('media'))) return;
  if (!openOperations.isCurrent(operation)) return;
  setState((s) => ({ doc: inlineMediaSession(toSession(s.doc), defaultMediaSet('Media')) }));
  invalidatePreflight();
}

export async function openMediaSet(path?: string): Promise<void> {
  const { platform } = rt();
  if (getState().output.phase !== 'off') {
    notify.warning('Stop output before replacing the media rotation.');
    return;
  }
  const outcome = await runLatestOpen(
    openOperations,
    async () => {
      if (!(await ensureResourceSaved('media'))) return null;
      const target =
        path ?? (await platform.dialogs.chooseMediaSetToOpen(getState().prefs.lastDirectory));
      if (!target) return null;
      return platform.files.openMediaSet(target, getState().pathStyle);
    },
    (result) => result.ok,
    (result) => {
      if (!result.ok || getState().output.phase !== 'off') return;
      const next = replaceMediaInSession(toSession(getState().doc), result);
      setState({ doc: { ...next, show: { ...next.show, dirty: true } }, selectedMediaIds: [] });
      invalidatePreflight();
    },
  );
  if (outcome.status === 'failed' && !outcome.value.ok) {
    await showError('That media set could not be opened', outcome.value.message);
    return;
  }
  if (outcome.status === 'error') {
    await showError('That media set could not be opened', String(outcome.error));
    return;
  }
  if (outcome.status !== 'committed' || !outcome.value.ok) return;
  rememberDirectory(outcome.value.filePath);
  if (outcome.value.missingPaths.length > 0)
    notify.warning(
      `${outcome.value.missingPaths.length} media file${outcome.value.missingPaths.length === 1 ? '' : 's'} could not be found.`,
    );
}

/** Stop using a linked `.pictaset` and keep its items inside the show instead. */
export function embedMediaSet(): void {
  const state = getState();
  if (state.doc.show.data.media.kind !== 'file') return;
  const data: MediaSet = mediaSetOf(state.doc.show.data, state.pathStyle);
  setState((s) => ({ doc: inlineMediaSession(toSession(s.doc), data) }));
  notify.info('The media rotation is now stored in the show.');
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export function teamFromDetails(details: NewTeamDetails): Team {
  const custom =
    details.sport === 'custom' ? makeCustomSport(details.customName ?? 'Custom', []) : undefined;
  const team = createTeam(details.name, details.sport, details.primary, details.secondary, custom);
  // A custom sport has no presets; give it the two groups every live board needs.
  if (team.groups.length === 0)
    return {
      ...team,
      groups: [makeGroup('Starters', [], 'starters'), makeGroup('Playing Now', [], 'on-court')],
    };
  return team;
}

export async function createNewTeam(): Promise<void> {
  const operation = openOperations.start();
  if (!(await ensureResourceSaved('team'))) return;
  const details = await ask.newTeam();
  if (!details || !openOperations.isCurrent(operation)) return;
  const team = teamFromDetails(details);
  setState((s) => {
    const data: ShowDocument = {
      ...s.doc.show.data,
      team: { kind: 'inline', data: team },
      event: { stats: {}, liveGroups: {}, score: defaultVolleyballScore(team) },
    };
    return {
      doc: {
        ...s.doc,
        show: { ...s.doc.show, data, dirty: true },
        teamFilePath: null,
        teamDirty: true,
      },
      scoreHistory: createScoreHistory(data.event.score!),
      statLog: emptyStatLog(),
      selectedPlayerId: null,
      selectedGroupId: team.groups[0]?.id ?? null,
      statsGroupId: defaultLiveGroup(team)?.id ?? null,
      mode: 'roster',
    };
  });
  notify.info(`Created ${team.name}`);
}

export async function openTeam(path?: string): Promise<void> {
  const { platform } = rt();
  const outcome = await runLatestOpen(
    openOperations,
    async () => {
      if (!(await ensureResourceSaved('team'))) return null;
      const target =
        path ?? (await platform.dialogs.chooseTeamToOpen(getState().prefs.lastDirectory));
      if (!target) return null;
      return platform.files.openTeam(target, getState().pathStyle);
    },
    (result) => result.ok,
    (result) => {
      if (!result.ok) return;
      const next = replaceTeamInSession(toSession(getState().doc), result);
      setState({
        doc: { ...next, show: { ...next.show, dirty: true } },
        scoreHistory: createScoreHistory(next.show.data.event.score!),
        statLog: emptyStatLog(),
        selectedPlayerId: null,
        selectedGroupId: result.data.groups[0]?.id ?? null,
        statsGroupId: null,
        manual: null,
      });
    },
  );
  if (outcome.status === 'failed' && !outcome.value.ok) {
    await showError('That team could not be opened', outcome.value.message);
    return;
  }
  if (outcome.status === 'error') {
    await showError('That team could not be opened', String(outcome.error));
    return;
  }
  if (outcome.status !== 'committed' || !outcome.value.ok) return;
  rememberDirectory(outcome.value.filePath);
  notify.info(`Opened ${outcome.value.data.name}`);
  if (outcome.value.missingPaths.length > 0)
    notify.warning(
      `${outcome.value.missingPaths.length} team media file${outcome.value.missingPaths.length === 1 ? '' : 's'} could not be found.`,
    );
}

export async function reveal(kind: 'show' | 'media' | 'team'): Promise<void> {
  const doc = getState().doc;
  const path =
    kind === 'show' ? doc.show.filePath : kind === 'media' ? doc.mediaFilePath : doc.teamFilePath;
  if (!path) {
    notify.info('Save it first to reveal it on disk.');
    return;
  }
  try {
    await rt().platform.files.reveal(path);
  } catch (error) {
    notify.error('Could not reveal the file', String(error));
  }
}

export async function revealPath(path: string): Promise<void> {
  try {
    await rt().platform.files.reveal(path);
  } catch (error) {
    notify.error('Could not reveal the file', String(error));
  }
}

// ---------------------------------------------------------------------------
// Recovery and lifecycle
// ---------------------------------------------------------------------------

export function applyRecovery(snapshot: RecoverySnapshot): void {
  adopt({
    show: { filePath: snapshot.showFilePath, data: snapshot.data, dirty: snapshot.showDirty },
    mediaFilePath: snapshot.mediaFilePath,
    mediaDirty: snapshot.mediaDirty,
    teamFilePath: snapshot.teamFilePath,
    teamDirty: snapshot.teamDirty,
  });
}

export async function offerRecovery(): Promise<boolean> {
  const { platform } = rt();
  const snapshot = await platform.recovery.read();
  if (!snapshot || !hasUnsavedWork(snapshot)) return false;
  const style = getState().pathStyle;
  const names = dirtyNames(
    {
      show: { filePath: snapshot.showFilePath, data: snapshot.data, dirty: snapshot.showDirty },
      mediaFilePath: snapshot.mediaFilePath,
      mediaDirty: snapshot.mediaDirty,
      teamFilePath: snapshot.teamFilePath,
      teamDirty: snapshot.teamDirty,
    },
    style,
  );
  const choice = await ask.recovery(snapshot.savedAt, names);
  if (choice === 'recover') {
    applyRecovery(snapshot);
    notify.success('Recovered unsaved work from your last session.');
    return true;
  }
  await platform.recovery.discard();
  return false;
}

export async function requestQuit(): Promise<void> {
  const { platform } = rt();
  if (!(await ensureSaved('quitting Picta'))) return;
  await stopOutput();
  await clearRecovery();
  const geometry = await platform.window.geometry();
  const prefs = geometry ? { ...getState().prefs, window: geometry } : getState().prefs;
  await platform.prefs.flush(prefs);
  await platform.presentation.close().catch(() => undefined);
  await platform.window.quit().catch(() => undefined);
}
