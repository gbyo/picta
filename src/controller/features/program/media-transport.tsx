import { useMemo } from 'react';
import { Button, Surface } from '@cladd-ui/react';
import { ChevronLeft, ChevronRight, CornerDownRight, PauseCircle, Zap } from 'lucide-react';
import type { MediaItem } from '@core/domain.js';
import { basename } from '@core/paths.js';
import { mediaDurationSeconds } from '@core/media.js';
import { Hint } from '@/components/picta/hint';
import { IconButton } from '@/components/picta/controls';
import { MediaThumb } from '@/components/picta/media-thumb';
import { Scroll, SectionHeader } from '@/components/picta/workspace';
import { cn } from '@/lib/utils';
import { usePicta, usePictaShallow } from '@/state/store';
import { mediaPanel } from '@/state/derive';
import { useMediaSet, useProgramScreen } from '@/hooks';
import { jumpToMedia, nextMedia, previousMedia } from '@/actions/output';
import { showMediaNow } from '@/actions/media';
import { useNow } from '@/use-now';

function HoldMeter({ since, durationMs }: { since: number; durationMs: number }) {
  const now = useNow(250);
  const progress = Math.min(1, Math.max(0, (now - since) / durationMs));
  const remaining = Math.max(0, Math.ceil((durationMs - (now - since)) / 1000));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-cladd-surface-cut">
        <div
          className="h-full rounded-full bg-cladd-fg-soft"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span className="w-7 text-right text-cladd-xs text-cladd-fg-softer tabular">
        {remaining}s
      </span>
    </div>
  );
}

/**
 * The rotation while live: what is on now, what comes next, and the rundown.
 * Previous/Next and "Go to" move the rotation; "Show now" plays one item as a
 * cue and then returns to where the rotation was.
 */
export function MediaTransport() {
  const set = useMediaSet();
  const style = usePicta((state) => state.pathStyle);
  const { itemId, since, skipped, cueActive } = usePictaShallow((state) => ({
    itemId: state.output.media.itemId,
    since: state.output.media.since,
    skipped: state.output.skippedItemIds,
    cueActive: state.output.cue.state.active,
  }));
  const screen = useProgramScreen();
  const hasMediaPanel = Boolean(mediaPanel(screen));
  const skippedSet = useMemo(() => new Set(skipped), [skipped]);
  const playable = useMemo(
    () => set.items.filter((item) => !item.missing && !skippedSet.has(item.id)),
    [set.items, skippedSet],
  );
  const current = set.items.find((item) => item.id === itemId) ?? null;
  const currentPlayableIndex = current ? playable.findIndex((item) => item.id === current.id) : -1;
  const next =
    playable.length > 1 && currentPlayableIndex >= 0
      ? playable[(currentPlayableIndex + 1) % playable.length]
      : null;
  const name = (item: MediaItem) => basename(item.path, style);

  if (set.items.length === 0)
    return (
      <section aria-label="Media" className="flex flex-col gap-1">
        <SectionHeader label="Media" detail="No rotation" />
        <p className="text-cladd-xs text-cladd-fg-softer">The media rotation is empty.</p>
      </section>
    );

  return (
    <section aria-label="Media transport" className="flex min-h-0 flex-1 flex-col gap-1.5">
      <SectionHeader
        label="Media"
        detail={
          current && currentPlayableIndex >= 0
            ? `${currentPlayableIndex + 1} of ${playable.length}`
            : `${playable.length} playable`
        }
        actions={
          <>
            <IconButton
              label="Previous media"
              keys={['←']}
              intent="default"
              disabled={!hasMediaPanel || playable.length === 0}
              onClick={previousMedia}
            >
              <ChevronLeft />
            </IconButton>
            <IconButton
              label="Next media"
              keys={['→']}
              intent="default"
              disabled={!hasMediaPanel || playable.length === 0}
              onClick={nextMedia}
            >
              <ChevronRight />
            </IconButton>
          </>
        }
      />
      {!hasMediaPanel ? (
        <Surface
          level={2}
          className="shrink-0 rounded-cladd-md"
          contentClassName="flex items-center gap-2 px-2.5 py-2 text-cladd-xs text-cladd-fg-soft"
        >
          <PauseCircle className="size-4 shrink-0 text-cladd-fg-softer" />
          {screen.name} has no media panel. The rotation resumes on a Screen with one.
        </Surface>
      ) : (
        <Surface
          level={2}
          className="shrink-0 rounded-cladd-md"
          contentClassName="flex gap-2.5 p-2"
        >
          {current ? (
            <MediaThumb item={current} sizing={set.imageSizing} className="w-20" />
          ) : (
            <div className="aspect-video w-20 rounded-cladd-3xs bg-cladd-surface-cut" />
          )}
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-1">
            <div className="min-w-0">
              <p
                className="truncate text-cladd-xs font-semibold"
                title={current ? name(current) : ''}
              >
                {current ? name(current) : 'Starting…'}
              </p>
              <p className="flex min-w-0 items-center gap-1 text-cladd-xs text-cladd-fg-softer">
                <CornerDownRight className="size-3 shrink-0" />
                <span className="truncate">{next ? `Next: ${name(next)}` : 'Only item'}</span>
              </p>
            </div>
            {cueActive ? (
              <p className="text-cladd-xs text-cue">Paused for a cue</p>
            ) : current?.type === 'image' && since > 0 ? (
              <HoldMeter since={since} durationMs={mediaDurationSeconds(current, set) * 1000} />
            ) : current?.type === 'video' ? (
              <p className="text-cladd-xs text-cladd-fg-softer">Video · advances when it ends</p>
            ) : null}
          </div>
        </Surface>
      )}
      <Scroll>
        <ol aria-label="Rundown" className="flex flex-col py-0.5">
          {set.items.map((item, index) => {
            const isCurrent = item.id === itemId;
            const unavailable = item.missing || skippedSet.has(item.id);
            return (
              <li
                key={item.id}
                className={cn(
                  'group flex h-cladd-md items-center gap-2 rounded-cladd-md pr-1 pl-1.5 text-cladd-xs',
                  isCurrent
                    ? 'bg-cladd-surface-hover font-semibold'
                    : 'text-cladd-fg-soft hover:bg-cladd-surface-hover',
                )}
              >
                <span className="w-5 shrink-0 text-right text-cladd-xs text-cladd-fg-softer tabular">
                  {index + 1}
                </span>
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    isCurrent ? 'bg-live' : 'bg-transparent',
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate',
                    unavailable && 'text-cladd-fg-softer line-through',
                  )}
                >
                  {name(item)}
                </span>
                {unavailable ? (
                  <span className="text-cladd-xs text-danger">
                    {item.missing ? 'Missing' : 'Skipped'}
                  </span>
                ) : (
                  <span className="flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <Hint label="Continue the rotation from this item">
                      <Button
                        size="sm"
                        variant="transparent"
                        outline={false}
                        disabled={!hasMediaPanel || isCurrent}
                        onClick={() => jumpToMedia(item.id)}
                        aria-label={`Go to ${name(item)}`}
                      >
                        Go to
                      </Button>
                    </Hint>
                    <Hint label="Show once as a cue, then return to the rotation">
                      <Button
                        size="sm"
                        color="cue"
                        variant="transparent"
                        outline={false}
                        onClick={() => void showMediaNow(item)}
                        aria-label={`Show ${name(item)} now`}
                      >
                        <Zap />
                        Show now
                      </Button>
                    </Hint>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Scroll>
    </section>
  );
}
