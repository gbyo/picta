import { useState } from 'react';
import { Film, ImageOff, TriangleAlert } from 'lucide-react';
import type { MediaItem } from '@core/domain.js';
import { cn } from '@/lib/utils';
import { rt } from '@/runtime';

/**
 * A thumbnail straight from the local file. Videos show an early frame; a file
 * that is missing or will not decode says so instead of showing a broken image.
 */
export function MediaThumb({
  item,
  sizing = 'fit',
  className,
  failed,
  typeIcon = true,
}: {
  item: MediaItem;
  sizing?: 'fit' | 'fill';
  className?: string;
  failed?: boolean;
  typeIcon?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const fit = sizing === 'fill' ? 'object-cover' : 'object-contain';
  let body;
  if (item.missing)
    body = (
      <ImageOff className="size-1/3 max-h-6 max-w-6 text-danger/80" aria-label="Missing file" />
    );
  else if (broken)
    body = (
      <TriangleAlert className="size-1/3 max-h-6 max-w-6 text-warn" aria-label="Cannot preview" />
    );
  else if (item.type === 'image')
    body = (
      <img
        src={rt().platform.assetUrl(item.path)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setBroken(true)}
        className={cn('absolute inset-0 size-full', fit)}
      />
    );
  else
    body = (
      <>
        <video
          src={`${rt().platform.assetUrl(item.path)}#t=0.5`}
          muted
          playsInline
          preload="metadata"
          onError={() => setBroken(true)}
          className={cn('absolute inset-0 size-full', fit)}
        />
        {typeIcon && (
          <Film className="absolute right-1 bottom-1 size-3 text-white drop-shadow" aria-hidden />
        )}
      </>
    );
  return (
    <div
      className={cn(
        'relative flex aspect-video shrink-0 items-center justify-center overflow-hidden rounded-cladd-3xs bg-black',
        (item.missing || failed) && 'ring-1 ring-danger/60',
        className,
      )}
    >
      {body}
    </div>
  );
}
