import { describe, expect, it, vi } from 'vitest';
import { MediaPreflightCache } from '../src/app/media-preflight.js';
import type { MediaItem } from '../src/core/domain.js';

const image: MediaItem = { id: 'image', type: 'image', path: '/media/image.png' };
const video: MediaItem = { id: 'video', type: 'video', path: '/media/video.mp4' };
const bad: MediaItem = { id: 'bad', type: 'video', path: '/media/bad.webm' };

describe('WebView media preflight', () => {
  it('reports usable and unusable items and checks videos through the injected WebView probe', async () => {
    const probe = vi.fn(async (item: MediaItem) =>
      item.path.endsWith('bad.webm') ? 'codec unavailable' : null,
    );
    const cache = new MediaPreflightCache();
    const result = await cache.check([image, video, bad], {
      exists: async (paths) => paths.map(() => true),
      allow: async () => undefined,
      sourceForPath: (path) => `asset://${path}`,
      probe,
    });

    expect(result).toMatchObject({ total: 3, ready: 2 });
    expect(result.failed).toEqual([{ id: 'bad', path: bad.path, message: 'codec unavailable' }]);
    expect(probe).toHaveBeenCalledWith(image, `asset://${image.path}`, expect.any(Number));
    expect(probe).toHaveBeenCalledWith(video, `asset://${video.path}`, expect.any(Number));
  });

  it('caches results and invalidates a changed media path', async () => {
    const probe = vi.fn(async () => null);
    const cache = new MediaPreflightCache();
    const options = {
      exists: async (paths: readonly string[]) => paths.map(() => true),
      allow: async () => undefined,
      sourceForPath: (path: string) => path,
      probe,
    };
    await cache.check([image], options);
    await cache.check([image], options);
    expect(probe).toHaveBeenCalledTimes(1);
    cache.clear([image.path]);
    await cache.check([image], options);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('marks missing items failed without trying to decode them', async () => {
    const probe = vi.fn(async () => null);
    const cache = new MediaPreflightCache();
    const missing = { ...image, missing: true };
    const result = await cache.check([missing], {
      exists: async () => [true],
      allow: async () => undefined,
      probe,
    });

    expect(result.ready).toBe(0);
    expect(result.failed[0]?.message).toBe('The file is missing.');
    expect(probe).not.toHaveBeenCalled();
  });
});
