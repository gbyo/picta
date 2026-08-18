/**
 * Opening and saving `.picta` documents.
 *
 * Everything that touches disk goes through Picta's own commands, which only
 * accept `.picta` files and supported images. A document is data: it can name
 * files, and that is all it can do.
 */

import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { allowImages, pathsExist, readPicta, writePicta } from './ipc.js';
import { parsePicta, resolveParsedPaths, serializePicta } from '../core/picta-file.js';
import { dirname, type PathStyle } from '../core/paths.js';
import { makeImageItem } from '../core/document.js';
import type { DocumentData, ImageItem } from '../core/types.js';
import { SUPPORTED_IMAGE_EXTENSIONS } from '../core/types.js';

export const IMAGE_FILTER = {
  name: 'Images',
  extensions: [...SUPPORTED_IMAGE_EXTENSIONS],
};

export const PICTA_FILTER = { name: 'Picta show', extensions: ['picta'] };

export type OpenOutcome =
  | { ok: true; filePath: string; data: DocumentData; missingCount: number }
  | { ok: false; message: string };

/** Ask the OS which images to add. Returns absolute paths, or [] if cancelled. */
export async function chooseImages(startDirectory: string | null): Promise<string[]> {
  const selection = await openDialog({
    multiple: true,
    directory: false,
    title: 'Choose Images',
    filters: [IMAGE_FILTER],
    ...(startDirectory ? { defaultPath: startDirectory } : {}),
  });
  if (selection === null) return [];
  return Array.isArray(selection) ? selection : [selection];
}

export async function choosePictaToOpen(startDirectory: string | null): Promise<string | null> {
  const selection = await openDialog({
    multiple: false,
    directory: false,
    title: 'Open',
    filters: [PICTA_FILTER],
    ...(startDirectory ? { defaultPath: startDirectory } : {}),
  });
  return typeof selection === 'string' ? selection : null;
}

export async function choosePictaToSave(
  startDirectory: string | null,
  suggestedName: string,
): Promise<string | null> {
  const defaultPath = startDirectory ? `${startDirectory}/${suggestedName}` : suggestedName;
  const selection = await saveDialog({
    title: 'Save As',
    filters: [PICTA_FILTER],
    defaultPath,
  });
  return selection ?? null;
}

export async function chooseFolder(startDirectory: string | null): Promise<string | null> {
  const selection = await openDialog({
    directory: true,
    multiple: false,
    title: 'Locate Images',
    ...(startDirectory ? { defaultPath: startDirectory } : {}),
  });
  return typeof selection === 'string' ? selection : null;
}

/**
 * Mark which images actually exist, and grant the presentation webview access
 * to the ones that do.
 */
export async function refreshImages(images: readonly ImageItem[]): Promise<ImageItem[]> {
  if (images.length === 0) return [];
  const paths = images.map((image) => image.path);
  let present: boolean[];
  try {
    present = await pathsExist(paths);
  } catch {
    present = paths.map(() => true);
  }
  const next = images.map((image, index) => ({ ...image, missing: present[index] !== true }));

  const usable = next.filter((image) => !image.missing).map((image) => image.path);
  if (usable.length > 0) {
    try {
      await allowImages(usable);
    } catch {
      // A rejected path simply will not render; the show skips it.
    }
  }
  return next;
}

export async function openDocument(filePath: string, style: PathStyle): Promise<OpenOutcome> {
  let text: string;
  try {
    text = await readPicta(filePath);
  } catch (error) {
    return { ok: false, message: String(error) };
  }

  const parsed = parsePicta(text);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const absolute = resolveParsedPaths(parsed.value, filePath, style);
  const images = await refreshImages(absolute.map((path) => makeImageItem(path)));

  return {
    ok: true,
    filePath,
    data: {
      images,
      intervalSeconds: parsed.value.intervalSeconds,
      transition: parsed.value.transition,
      imageSizing: parsed.value.imageSizing,
      layout: parsed.value.layout,
      roster: parsed.value.roster,
    },
    missingCount: images.filter((image) => image.missing).length,
  };
}

export async function saveDocument(
  filePath: string,
  data: DocumentData,
  style: PathStyle,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await writePicta(filePath, serializePicta(data, filePath, style));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
}

export function directoryOf(path: string, style: PathStyle): string {
  return dirname(path, style);
}
