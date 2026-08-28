/**
 * Lightweight media readiness checks using the current WebView. This is a
 * capability probe, not a bundled codec parser: the presentation WebView is
 * still the final authority when an item is actually shown.
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import type { MediaItem } from '../core/domain.js';
import { allowMedia, pathsExist } from './ipc.js';

export interface MediaPreflightFailure {
  id: string;
  path: string;
  message: string;
}

export interface MediaPreflightResult {
  total: number;
  ready: number;
  failed: MediaPreflightFailure[];
}

export interface MediaPreflightOptions {
  exists?: (paths: readonly string[]) => Promise<boolean[]>;
  allow?: (paths: readonly string[]) => Promise<void>;
  sourceForPath?: (path: string) => string;
  probe?: (item: MediaItem, source: string, timeoutMs: number) => Promise<string | null>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 6000;

function finishImage(image: HTMLImageElement, message: string | null): string | null {
  image.removeAttribute('src');
  return message;
}

/** Load and decode an image without putting it in the visible document. */
export function probeImage(source: string, timeoutMs: number): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve('Image probing is unavailable.');
  const image = document.createElement('img');
  image.decoding = 'async';
  return new Promise((resolve) => {
    let settled = false;
    let timer: number;
    const finish = (message: string | null): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(finishImage(image, message));
    };
    timer = window.setTimeout(() => finish('The image did not finish decoding.'), timeoutMs);
    image.addEventListener(
      'load',
      () => {
        if (typeof image.decode !== 'function') {
          finish(null);
          return;
        }
        void image
          .decode()
          .then(() => finish(null))
          .catch(() => finish('The image loaded but could not be decoded.'));
      },
      { once: true },
    );
    image.addEventListener(
      'error',
      () => finish('The image could not be loaded by this WebView.'),
      { once: true },
    );
    image.src = source;
    if (image.complete && image.naturalWidth > 0) {
      queueMicrotask(() => {
        if (typeof image.decode !== 'function') finish(null);
        else
          void image
            .decode()
            .then(() => finish(null))
            .catch(() => finish('The image loaded but could not be decoded.'));
      });
    }
  });
}

function finishVideo(video: HTMLVideoElement, message: string | null): string | null {
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch {
    // Cleanup is best effort; the element was never attached to the document.
  }
  return message;
}

/** Establish that the WebView can load and start the video muted, without audience output. */
export function probeVideo(source: string, timeoutMs: number): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve('Video probing is unavailable.');
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.volume = 0;
  video.controls = false;
  video.playsInline = true;
  return new Promise((resolve) => {
    let settled = false;
    let timer: number;
    const finish = (message: string | null): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(finishVideo(video, message));
    };
    timer = window.setTimeout(() => finish('The video did not become playable.'), timeoutMs);
    video.addEventListener(
      'canplay',
      () => {
        let started: Promise<void> | void;
        try {
          started = video.play();
        } catch {
          finish('The WebView could load the video but could not start it.');
          return;
        }
        void Promise.resolve(started)
          .then(() => finish(null))
          .catch(() => finish('The WebView could load the video but could not start it.'));
      },
      { once: true },
    );
    video.addEventListener(
      'error',
      () => finish('The video could not be loaded by this WebView.'),
      { once: true },
    );
    video.src = source;
  });
}

async function defaultProbe(
  item: MediaItem,
  source: string,
  timeoutMs: number,
): Promise<string | null> {
  return item.type === 'image' ? probeImage(source, timeoutMs) : probeVideo(source, timeoutMs);
}

function cacheKey(item: MediaItem): string {
  return `${item.type}\u0000${item.path}`;
}

/** Cache only the WebView decode result; callers invalidate after media changes. */
export class MediaPreflightCache {
  #cache = new Map<string, string | null>();

  clear(paths?: readonly string[]): void {
    if (!paths) {
      this.#cache.clear();
      return;
    }
    const changed = new Set(paths);
    for (const key of this.#cache.keys()) {
      const path = key.slice(key.indexOf('\u0000') + 1);
      if (changed.has(path)) this.#cache.delete(key);
    }
  }

  async check(
    items: readonly MediaItem[],
    options: MediaPreflightOptions = {},
  ): Promise<MediaPreflightResult> {
    if (items.length === 0) return { total: 0, ready: 0, failed: [] };
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const sourceForPath = options.sourceForPath ?? convertFileSrc;
    const probe = options.probe ?? defaultProbe;
    const exists = options.exists ?? pathsExist;
    const allow = options.allow ?? allowMedia;
    const uniquePaths = [...new Set(items.map((item) => item.path))];
    let present: boolean[];
    try {
      present = await exists(uniquePaths);
    } catch {
      present = uniquePaths.map(() => true);
    }
    const presentByPath = new Map(
      uniquePaths.map((path, index) => [path, present[index] !== false]),
    );
    const toAllow = uniquePaths.filter((path) => presentByPath.get(path));
    let allowError = false;
    if (toAllow.length > 0) {
      try {
        await allow(toAllow);
      } catch {
        allowError = true;
      }
    }

    const statusByKey = new Map<string, string | null>();
    const uniqueItems = [...new Map(items.map((item) => [cacheKey(item), item])).values()];
    await Promise.all(
      uniqueItems.map(async (item) => {
        const key = cacheKey(item);
        if (statusByKey.has(key)) return;
        if (item.missing || !presentByPath.get(item.path)) {
          statusByKey.set(key, 'The file is missing.');
          return;
        }
        if (allowError) {
          statusByKey.set(key, 'Picta could not grant the presentation access to this file.');
          return;
        }
        const cached = this.#cache.get(key);
        if (cached !== undefined || this.#cache.has(key)) {
          statusByKey.set(key, cached ?? null);
          return;
        }
        let message: string | null = null;
        try {
          message = await probe(item, sourceForPath(item.path), timeoutMs);
        } catch {
          message = 'The WebView could not check this file.';
        }
        this.#cache.set(key, message);
        statusByKey.set(key, message);
      }),
    );

    const failed = items.flatMap((item) => {
      const message = statusByKey.get(cacheKey(item));
      return message ? [{ id: item.id, path: item.path, message }] : [];
    });
    return { total: items.length, ready: items.length - failed.length, failed };
  }
}
