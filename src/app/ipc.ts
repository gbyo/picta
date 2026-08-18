/**
 * Typed wrappers around Picta's Rust commands.
 *
 * Every filesystem and window operation the frontend can perform is in this
 * file, which makes the app's whole native surface easy to audit.
 */

import { invoke } from '@tauri-apps/api/core';
import type { DisplayInfo } from '../core/monitors.js';
import type { UpdateStatus } from '../core/update.js';
import type { PathStyle } from '../core/paths.js';

export function listDisplays(): Promise<DisplayInfo[]> {
  return invoke<DisplayInfo[]>('list_displays');
}

export function identifyDisplays(): Promise<void> {
  return invoke<void>('identify_displays');
}

export function openPresentation(displayId: string): Promise<DisplayInfo> {
  return invoke<DisplayInfo>('open_presentation', { displayId });
}

export function closePresentation(): Promise<void> {
  return invoke<void>('close_presentation');
}

export function allowImages(paths: string[]): Promise<void> {
  return invoke<void>('allow_images', { paths });
}

export function allowMedia(paths: string[]): Promise<void> {
  return invoke<void>('allow_media', { paths });
}

export function pathsExist(paths: string[]): Promise<boolean[]> {
  if (paths.length === 0) return Promise.resolve([]);
  return invoke<boolean[]>('paths_exist', { paths });
}

export function readPicta(path: string): Promise<string> {
  return invoke<string>('read_picta', { path });
}

export function readDocument(path: string): Promise<string> {
  return invoke<string>('read_document', { path });
}

export function writePicta(path: string, contents: string): Promise<void> {
  return invoke<void>('write_picta', { path, contents });
}

export function writeDocument(path: string, contents: string): Promise<void> {
  return invoke<void>('write_document', { path, contents });
}

export function revealPath(path: string): Promise<void> {
  return invoke<void>('reveal_path', { path });
}

export function loadPrefs(): Promise<unknown> {
  return invoke<unknown>('load_prefs');
}

export function savePrefs(value: unknown): Promise<void> {
  return invoke<void>('save_prefs', { value });
}

export function startupFile(): Promise<string | null> {
  return invoke<string | null>('startup_file');
}

export function pathStyle(): Promise<PathStyle> {
  return invoke<PathStyle>('path_style');
}

export function quitApp(): Promise<void> {
  return invoke<void>('quit_app');
}

/**
 * Ask whether a newer Picta has been released.
 *
 * The request is made in Rust against one compile-time URL, so the webview has
 * no network capability of its own and cannot be talked into fetching something
 * else. Never rejects: a machine with no internet simply reports nothing new.
 */
export async function checkForUpdate(): Promise<UpdateStatus | null> {
  try {
    return await invoke<UpdateStatus>('check_for_update');
  } catch {
    return null;
  }
}

/** Open the releases page in the operator's browser. */
export async function openReleasesPage(): Promise<void> {
  await invoke('open_releases_page');
}
