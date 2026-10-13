/**
 * Building the media rotation. The rotation's structure is locked while ON
 * AIR: the live run plays a snapshot, so edits could not reach the audience and
 * would only make the controller disagree with the display.
 */

import type { Cue, MediaItem, MediaSet } from '@core/domain.js';
import {
  appendMedia,
  isSupportedMediaPath,
  mediaDurationSeconds,
  moveMediaItem,
} from '@core/media.js';
import { basename, resolvePath } from '@core/paths.js';
import { rt } from '../runtime.js';
import { getState, setState } from '../state/store.js';
import { cueTargetFor, programScreen } from '../state/derive.js';
import { currentMediaSet, setMediaSet } from './edit.js';
import { invalidatePreflight } from './output.js';
import { notify } from './notify.js';

export function rotationLocked(): boolean {
  return getState().output.phase !== 'off';
}

function guard(): boolean {
  if (!rotationLocked()) return true;
  notify.warning('The rotation is locked while ON AIR. Stop output to change it.');
  return false;
}

function commit(set: MediaSet, changedPaths?: readonly string[]): void {
  setMediaSet(set);
  invalidatePreflight(changedPaths);
}

export async function addMediaPaths(paths: readonly string[]): Promise<void> {
  if (!guard()) return;
  const supported = paths.filter(isSupportedMediaPath);
  if (supported.length === 0) {
    notify.warning('Picta plays PNG, JPEG, WebP, MP4 and WebM files.');
    return;
  }
  const before = currentMediaSet();
  const next = appendMedia(before, supported);
  const added = next.items.length - before.items.length;
  await rt()
    .platform.files.allowMedia(supported)
    .catch(() => undefined);
  commit(next, supported);
  const skipped = paths.length - supported.length;
  const duplicates = supported.length - added;
  notify.info(
    `Added ${added} item${added === 1 ? '' : 's'}${duplicates ? ` · ${duplicates} already in the rotation` : ''}${skipped ? ` · ${skipped} unsupported skipped` : ''}`,
  );
  const newIds = next.items.slice(before.items.length).map((item) => item.id);
  if (newIds.length > 0) setState({ selectedMediaIds: newIds.slice(-1) });
}

export async function chooseAndAddMedia(): Promise<void> {
  if (!guard()) return;
  const paths = await rt().platform.dialogs.chooseMedia(getState().prefs.lastDirectory);
  if (paths.length > 0) await addMediaPaths(paths);
}

export function removeMedia(ids: readonly string[]): void {
  if (!guard() || ids.length === 0) return;
  const before = currentMediaSet();
  const remove = new Set(ids);
  const removed = before.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => remove.has(item.id));
  if (removed.length === 0) return;
  commit({ ...before, items: before.items.filter((item) => !remove.has(item.id)) });
  setState((state) => ({
    selectedMediaIds: state.selectedMediaIds.filter((id) => !remove.has(id)),
  }));
  const count = removed.length;
  notify.undoable(`Removed ${count} item${count === 1 ? '' : 's'} from the rotation`, {
    // Put the removed items back where they were, keeping any later edits.
    run: () => {
      if (rotationLocked()) return;
      const latest = currentMediaSet();
      const present = new Set(latest.items.map((item) => item.id));
      const items = latest.items.slice();
      for (const { item, index } of removed) {
        if (present.has(item.id)) continue;
        items.splice(Math.min(index, items.length), 0, item);
      }
      commit({ ...latest, items });
    },
  });
}

export function clearMedia(): void {
  removeMedia(currentMediaSet().items.map((item) => item.id));
}

export function moveMedia(from: number, to: number): void {
  if (!guard()) return;
  const set = currentMediaSet();
  if (from === to || from < 0 || to < 0 || from >= set.items.length || to >= set.items.length)
    return;
  commit({ ...set, items: moveMediaItem(set.items, from, to) });
}

export function moveMediaById(id: string, overId: string): void {
  const items = currentMediaSet().items;
  moveMedia(
    items.findIndex((item) => item.id === id),
    items.findIndex((item) => item.id === overId),
  );
}

export function nudgeMedia(id: string, delta: number): void {
  const items = currentMediaSet().items;
  const from = items.findIndex((item) => item.id === id);
  if (from < 0) return;
  moveMedia(from, Math.max(0, Math.min(items.length - 1, from + delta)));
}

export function setItemDuration(id: string, seconds: number | null): void {
  if (!guard()) return;
  const set = currentMediaSet();
  commit({
    ...set,
    items: set.items.map((item) => {
      if (item.id !== id || item.type !== 'image') return item;
      if (seconds === null) {
        const { durationSeconds: _removed, ...rest } = item;
        return rest;
      }
      return { ...item, durationSeconds: Math.max(1, Math.min(86_400, Math.round(seconds))) };
    }),
  });
}

export function setMediaDefaults(
  update: Partial<Pick<MediaSet, 'imageDurationSeconds' | 'transition' | 'imageSizing' | 'name'>>,
): void {
  if (!guard()) return;
  const set = currentMediaSet();
  const next = { ...set, ...update };
  if (
    next.imageDurationSeconds !== set.imageDurationSeconds &&
    (!Number.isFinite(next.imageDurationSeconds) || next.imageDurationSeconds < 1)
  )
    return;
  next.imageDurationSeconds = Math.min(86_400, Math.round(next.imageDurationSeconds));
  setMediaSet(next);
}

/** Relink missing files by looking for the same file names in one folder. */
export async function locateMissingMedia(): Promise<void> {
  if (!guard()) return;
  const { platform } = rt();
  const state = getState();
  const style = state.pathStyle;
  const set = currentMediaSet();
  const missing = set.items.filter((item) => item.missing);
  if (missing.length === 0) return;
  const folder = await platform.dialogs.chooseFolder(
    state.prefs.lastDirectory,
    'Locate Moved Media',
  );
  if (!folder) return;
  const candidates = missing.map((item) => resolvePath(folder, basename(item.path, style), style));
  const exists = await platform.files
    .pathsExist(candidates)
    .catch(() => candidates.map(() => false));
  const replacements = new Map<string, string>();
  missing.forEach((item, index) => {
    if (exists[index]) replacements.set(item.id, candidates[index]!);
  });
  if (replacements.size === 0) {
    notify.warning('None of the missing files were in that folder.');
    return;
  }
  await platform.files.allowMedia([...replacements.values()]).catch(() => undefined);
  const latest = currentMediaSet();
  commit({
    ...latest,
    items: latest.items.map((item) => {
      const path = replacements.get(item.id);
      if (!path) return item;
      const { missing: _missing, ...rest } = item;
      return { ...rest, path };
    }),
  });
  const left = missing.length - replacements.size;
  notify.success(
    `Relinked ${replacements.size} file${replacements.size === 1 ? '' : 's'}${left ? ` · ${left} still missing` : ''}`,
  );
}

/** Show one item now as a temporary cue; the rotation resumes afterwards. */
export async function showMediaNow(item: MediaItem): Promise<void> {
  const state = getState();
  if (state.output.phase !== 'live' || item.missing) return;
  const { output } = rt();
  const label = basename(item.path, state.pathStyle);
  const target = cueTargetFor(programScreen(state));
  const cue: Cue =
    item.type === 'video'
      ? { type: 'video', target, path: item.path, label }
      : {
          type: 'image',
          target,
          path: item.path,
          holdMs: Math.max(3000, mediaDurationSeconds(item, currentMediaSet()) * 1000),
          label,
        };
  const [outcome] = await output.playCues([cue], { kind: 'single-media', label });
  if (outcome === 'failed') notify.warning(`${label} could not play.`);
}

export function selectMedia(ids: string[]): void {
  setState({ selectedMediaIds: ids });
}
