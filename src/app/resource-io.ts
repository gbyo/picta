/** Native dialogs and narrow IPC for team/media-set resources. */

import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { allowMedia, pathsExist, readDocument, writeDocument } from './ipc.js';
import { dirname, type PathStyle } from '../core/paths.js';
import { isSupportedMediaPath } from '../core/media.js';
import type { MediaRef, MediaSet, Team } from '../core/domain.js';
import { parseMediaSet, resolveMediaSetPaths, serializeMediaSet } from '../core/media-set-file.js';
import { parseTeam, resolveTeamPaths, serializeTeam } from '../core/team-file.js';

export const MEDIA_FILTER = {
  name: 'Supported Media',
  extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'],
};
export const TEAM_FILTER = { name: 'Picta Team', extensions: ['pictateam'] };
export const MEDIA_SET_FILTER = { name: 'Picta Media Set', extensions: ['pictaset'] };

export async function chooseMedia(startDirectory: string | null): Promise<string[]> {
  const selection = await openDialog({
    multiple: true,
    directory: false,
    title: 'Choose Media',
    filters: [MEDIA_FILTER],
    ...(startDirectory ? { defaultPath: startDirectory } : {}),
  });
  if (selection === null) return [];
  return (Array.isArray(selection) ? selection : [selection]).filter(isSupportedMediaPath);
}

export async function chooseFolder(
  startDirectory: string | null,
  title = 'Choose Folder',
): Promise<string | null> {
  const selection = await openDialog({
    multiple: false,
    directory: true,
    title,
    ...(startDirectory ? { defaultPath: startDirectory } : {}),
  });
  return typeof selection === 'string' ? selection : null;
}

export async function chooseTeamToOpen(startDirectory: string | null): Promise<string | null> {
  const selection = await openDialog({
    multiple: false,
    directory: false,
    title: 'Open Team',
    filters: [TEAM_FILTER],
    ...(startDirectory ? { defaultPath: startDirectory } : {}),
  });
  return typeof selection === 'string' ? selection : null;
}

export async function chooseMediaSetToOpen(startDirectory: string | null): Promise<string | null> {
  const selection = await openDialog({
    multiple: false,
    directory: false,
    title: 'Open Media Set',
    filters: [MEDIA_SET_FILTER],
    ...(startDirectory ? { defaultPath: startDirectory } : {}),
  });
  return typeof selection === 'string' ? selection : null;
}

export async function chooseTeamToSave(
  startDirectory: string | null,
  suggestedName: string,
): Promise<string | null> {
  const selection = await saveDialog({
    title: 'Save Team As',
    filters: [TEAM_FILTER],
    defaultPath: startDirectory ? `${startDirectory}/${suggestedName}` : suggestedName,
  });
  return selection ?? null;
}

export async function chooseMediaSetToSave(
  startDirectory: string | null,
  suggestedName: string,
): Promise<string | null> {
  const selection = await saveDialog({
    title: 'Save Media Set As',
    filters: [MEDIA_SET_FILTER],
    defaultPath: startDirectory ? `${startDirectory}/${suggestedName}` : suggestedName,
  });
  return selection ?? null;
}

export type ResourceOpenResult<T> =
  | {
      ok: true;
      filePath: string;
      data: T;
      missingPaths: string[];
    }
  | {
      ok: false;
      message: string;
    };

async function existing(paths: readonly string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  try {
    const result = await pathsExist([...paths]);
    return new Set(paths.filter((_, index) => result[index] === true));
  } catch {
    return new Set(paths);
  }
}

export async function openMediaSet(
  filePath: string,
  style: PathStyle,
): Promise<ResourceOpenResult<MediaSet>> {
  try {
    const parsed = parseMediaSet(await readDocument(filePath));
    if (!parsed.ok) return { ok: false, message: parsed.message };
    const data = resolveMediaSetPaths(parsed.value, filePath, style);
    const paths = data.items.map((item) => item.path);
    const present = await existing(paths);
    const refreshed = {
      ...data,
      items: data.items.map((item) => ({
        ...item,
        ...(present.has(item.path) ? {} : { missing: true }),
      })),
    };
    await allowMedia([...present]).catch(() => undefined);
    return {
      ok: true,
      filePath,
      data: refreshed,
      missingPaths: paths.filter((path) => !present.has(path)),
    };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
}

function teamMediaPaths(team: Team): string[] {
  const refs: MediaRef[] = team.players.flatMap((player) =>
    [player.media.photo, player.media.introVideo].filter(
      (item): item is MediaRef => item !== undefined,
    ),
  );
  return refs.map((ref) => ref.path);
}

export async function openTeam(
  filePath: string,
  style: PathStyle,
): Promise<ResourceOpenResult<Team>> {
  try {
    const parsed = parseTeam(await readDocument(filePath));
    if (!parsed.ok) return { ok: false, message: parsed.message };
    const data = resolveTeamPaths(parsed.value, filePath, style);
    const paths = teamMediaPaths(data);
    const present = await existing(paths);
    const refreshed: Team = {
      ...data,
      players: data.players.map((player) => ({
        ...player,
        media: {
          ...(player.media.photo === undefined
            ? {}
            : {
                photo: {
                  ...player.media.photo,
                  ...(present.has(player.media.photo.path) ? {} : { missing: true }),
                },
              }),
          ...(player.media.introVideo === undefined
            ? {}
            : {
                introVideo: {
                  ...player.media.introVideo,
                  ...(present.has(player.media.introVideo.path) ? {} : { missing: true }),
                },
              }),
        },
      })),
    };
    await allowMedia([...present]).catch(() => undefined);
    return {
      ok: true,
      filePath,
      data: refreshed,
      missingPaths: paths.filter((path) => !present.has(path)),
    };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
}

export async function saveMediaSet(
  filePath: string,
  data: MediaSet,
  style: PathStyle,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await writeDocument(filePath, serializeMediaSet(data, filePath, style));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
}

export async function saveTeam(
  filePath: string,
  data: Team,
  style: PathStyle,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await writeDocument(filePath, serializeTeam(data, filePath, style));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
}

export function directoryOfResource(path: string, _style: PathStyle): string {
  return dirname(path, _style);
}
