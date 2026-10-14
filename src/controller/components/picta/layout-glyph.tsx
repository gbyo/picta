import type { Screen } from '@core/domain.js';
import { cn } from '@/lib/utils';
import { CONTENT_META } from './content-meta';

/** A miniature of a Screen's composition: where each panel is and what it shows. */
export function LayoutGlyph({
  screen,
  className,
  tone = 'default',
}: {
  screen: Pick<Screen, 'panels'>;
  className?: string;
  tone?: 'default' | 'live' | 'armed';
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative aspect-video shrink-0 overflow-hidden rounded-cladd-3xs bg-cladd-surface-cut ring-1',
        tone === 'live' ? 'ring-live' : tone === 'armed' ? 'ring-accent' : 'ring-cladd-outline',
        className,
      )}
    >
      {screen.panels.map((panel) => {
        const meta = CONTENT_META[panel.content.kind];
        const Icon = meta.icon;
        return (
          <div
            key={panel.id}
            className={cn(
              'absolute flex items-center justify-center border border-black/40 text-white/70',
              meta.tint,
            )}
            style={{
              left: `${panel.rect.x * 100}%`,
              top: `${panel.rect.y * 100}%`,
              width: `${panel.rect.width * 100}%`,
              height: `${panel.rect.height * 100}%`,
            }}
          >
            {panel.content.kind !== 'blank' && <Icon className="size-[38%] max-h-3.5 max-w-3.5" />}
          </div>
        );
      })}
    </div>
  );
}
