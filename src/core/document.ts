/**
 * Document state and unsaved-changes tracking.
 *
 * Only what a `.picta` file actually stores counts as a document change.
 * Runtime facts — which image is on screen, whether the show is running, which
 * monitor is selected — are machine-specific and never mark the file dirty.
 */

import { defaultDocumentData, type DocumentData, type ImageItem } from './types.js';

export interface DocumentState {
  /** Absolute path of the file backing this document, or null for untitled. */
  filePath: string | null;
  data: DocumentData;
  dirty: boolean;
}

export function newDocument(): DocumentState {
  return { filePath: null, data: defaultDocumentData(), dirty: false };
}

export function documentTitle(state: DocumentState, style: '/' | '\\' = '/'): string {
  if (state.filePath === null) return 'Untitled';
  const parts = state.filePath.split(/[\\/]/);
  const name = parts[parts.length - 1] ?? state.filePath;
  void style;
  return name.replace(/\.picta$/i, '');
}

export function windowTitle(state: DocumentState): string {
  return `${state.dirty ? '• ' : ''}${documentTitle(state)} — Picta`;
}

export function makeImageItem(path: string, missing = false): ImageItem {
  return { path, missing };
}

/** De-duplicate while preserving order; adding the same file twice is a no-op. */
export function appendImages(
  existing: readonly ImageItem[],
  paths: readonly string[],
): ImageItem[] {
  const seen = new Set(existing.map((item) => item.path));
  const out = existing.slice();
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(makeImageItem(path));
  }
  return out;
}

export function missingImages(images: readonly ImageItem[]): { index: number; path: string }[] {
  const out: { index: number; path: string }[] = [];
  for (let i = 0; i < images.length; i += 1) {
    const item = images[i] as ImageItem;
    if (item.missing) out.push({ index: i, path: item.path });
  }
  return out;
}

export function countMissing(images: readonly ImageItem[]): number {
  return images.reduce((n, item) => n + (item.missing ? 1 : 0), 0);
}
