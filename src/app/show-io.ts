/** Opening legacy and v3 shows; all successful saves write v3. */

import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { allowMedia, pathsExist, readDocument, writeDocument } from './ipc.js';
import { parsePicta } from '../core/picta-file.js';
import {
  migratePictaV1,
  parseShow,
  resolveShowPaths,
  serializePictaV3,
  validateShowEventReferences,
} from '../core/show-file.js';
import type { MediaResource, ShowDocument } from '../core/domain.js';
import { validateScreens } from '../core/screens.js';
import { openMediaSet, openTeam } from './resource-io.js';
import type { PathStyle } from '../core/paths.js';

export const SHOW_FILTER = { name: 'Picta Show', extensions: ['picta'] };

export async function chooseShowToOpen(startDirectory: string | null): Promise<string | null> {
  const selection = await openDialog({
    multiple: false,
    directory: false,
    title: 'Open Show',
    filters: [SHOW_FILTER],
    ...(startDirectory ? { defaultPath: startDirectory } : {}),
  });
  return typeof selection === 'string' ? selection : null;
}

export async function chooseShowToSave(
  startDirectory: string | null,
  suggestedName: string,
): Promise<string | null> {
  const selection = await saveDialog({
    title: 'Save Show As',
    filters: [SHOW_FILTER],
    defaultPath: startDirectory ? `${startDirectory}/${suggestedName}` : suggestedName,
  });
  return selection ?? null;
}

function pathsForMedia(resource: MediaResource): string[] {
  return resource.kind === 'inline'
    ? resource.data.items.map((item) => item.path)
    : (resource.data?.items.map((item) => item.path) ?? []);
}

function pathsForTeam(team: import('../core/domain.js').Team): string[] {
  return team.players.flatMap((player) =>
    [player.media.photo, player.media.introVideo]
      .filter((media): media is NonNullable<typeof media> => media !== undefined)
      .map((media) => media.path),
  );
}

async function refreshMedia(resource: MediaResource): Promise<MediaResource> {
  if (!resource.data) return resource;
  const paths = pathsForMedia(resource);
  let result: boolean[];
  try {
    result = await pathsExist(paths);
  } catch {
    result = paths.map(() => true);
  }
  const present = new Set(paths.filter((_, index) => result[index] === true));
  await allowMedia([...present]).catch(() => undefined);
  return {
    ...resource,
    data: {
      ...resource.data,
      items: resource.data.items.map((item) => ({
        ...item,
        ...(present.has(item.path) ? {} : { missing: true }),
      })),
    },
  };
}

async function refreshTeam(
  resource: import('../core/domain.js').TeamResource,
): Promise<import('../core/domain.js').TeamResource> {
  if (!resource.data) return resource;
  const paths = pathsForTeam(resource.data);
  let result: boolean[];
  try {
    result = await pathsExist(paths);
  } catch {
    result = paths.map(() => true);
  }
  const present = new Set(paths.filter((_, index) => result[index] === true));
  await allowMedia([...present]).catch(() => undefined);
  const data = {
    ...resource.data,
    players: resource.data.players.map((player) => {
      const photo = player.media.photo
        ? {
            ...player.media.photo,
            ...(present.has(player.media.photo.path) ? {} : { missing: true }),
          }
        : undefined;
      const introVideo = player.media.introVideo
        ? {
            ...player.media.introVideo,
            ...(present.has(player.media.introVideo.path) ? {} : { missing: true }),
          }
        : undefined;
      return {
        ...player,
        media: {
          ...(photo ? { photo } : {}),
          ...(introVideo ? { introVideo } : {}),
        },
      };
    }),
  };
  return { ...resource, data };
}

async function hydrateLinkedResources(show: ShowDocument, style: PathStyle): Promise<ShowDocument> {
  let next = show;
  if (next.media.kind === 'file' && !next.media.data) {
    const loaded = await openMediaSet(next.media.path, style);
    if (loaded.ok) next = { ...next, media: { ...next.media, data: loaded.data } };
  }
  if (next.team?.kind === 'file' && !next.team.data) {
    const loaded = await openTeam(next.team.path, style);
    if (loaded.ok) next = { ...next, team: { ...next.team, data: loaded.data } };
  }
  if (next.team?.data) next = { ...next, team: await refreshTeam(next.team) };
  return next;
}

export type ShowOpenResult =
  | {
      ok: true;
      filePath: string;
      data: ShowDocument;
      missingCount: number;
      missingResources: { kind: 'team' | 'media-set'; path: string }[];
      migratedFromV1: boolean;
    }
  | {
      ok: false;
      message: string;
    };

export async function openShowDocument(
  filePath: string,
  style: PathStyle,
): Promise<ShowOpenResult> {
  try {
    const text = await readDocument(filePath);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, message: 'This show file is not valid JSON.' };
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      return { ok: false, message: 'This does not look like a Picta show.' };
    const version = (raw as Record<string, unknown>)['version'];
    let data: ShowDocument;
    let migratedFromV1 = false;
    if (version === 1) {
      const parsed = parsePicta(text);
      if (!parsed.ok) return { ok: false, message: parsed.message };
      data = resolveShowPaths(migratePictaV1(parsed.value), filePath, style);
      migratedFromV1 = true;
    } else {
      const parsed = parseShow(text);
      if (!parsed.ok) return { ok: false, message: parsed.message };
      data = resolveShowPaths(parsed.value, filePath, style);
      migratedFromV1 = version !== 3;
    }
    data = await hydrateLinkedResources(data, style);
    const eventReferenceError = validateShowEventReferences(data.event, data.team?.data);
    if (eventReferenceError) return { ok: false, message: eventReferenceError };
    const screenReferenceCheck = validateScreens(data.screens, data.defaultScreenId);
    if (!screenReferenceCheck.ok) return { ok: false, message: screenReferenceCheck.message };
    data = { ...data, media: await refreshMedia(data.media) };
    const missing =
      data.media.kind === 'inline'
        ? data.media.data.items.filter((item) => item.missing).length
        : (data.media.data?.items.filter((item) => item.missing).length ?? 0);
    const missingResources = [
      ...(data.media.kind === 'file' && !data.media.data
        ? [{ kind: 'media-set' as const, path: data.media.path }]
        : []),
      ...(data.team?.kind === 'file' && !data.team.data
        ? [{ kind: 'team' as const, path: data.team.path }]
        : []),
    ];
    return { ok: true, filePath, data, missingCount: missing, missingResources, migratedFromV1 };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
}

export async function saveShowDocument(
  filePath: string,
  data: ShowDocument,
  style: PathStyle,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await writeDocument(filePath, serializePictaV3(data, filePath, style));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
}
