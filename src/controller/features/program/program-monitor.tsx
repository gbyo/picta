import { SurfaceCut } from '@cladd-ui/react';
import { usePicta } from '@/state/store';
import { cn } from '@/lib/utils';
import { ScreenRender } from '@/components/picta/screen-render';
import { useDisplayAspect, useProgramMediaItem, useProgramScreen, useScreenContent } from '@/hooks';
import { selectedDisplay } from '@/state/derive';

/**
 * What Picta believes is on the audience display (PROGRAM), or what Go Live
 * will show (PREVIEW). Drawn from the same Screen model and score renderer as
 * the output, at the selected display's real aspect ratio.
 */
export function ProgramMonitor() {
  const phase = usePicta((state) => state.output.phase);
  const screen = useProgramScreen();
  const aspect = useDisplayAspect();
  const mediaItem = useProgramMediaItem();
  const content = useScreenContent(screen, mediaItem);
  const cue = usePicta((state) =>
    state.output.phase === 'live' ? state.output.cue.state.current : null,
  );
  const display = usePicta((state) => selectedDisplay(state));
  const live = phase === 'live';

  return (
    <section aria-label={live ? 'Program' : 'Preview'} className="flex flex-col gap-1.5">
      <div className="flex h-cladd-sm items-center gap-2">
        <span
          className={cn(
            'rounded-cladd-3xs px-1.5 py-0.5 text-cladd-xs font-bold tracking-wider',
            live ? 'bg-live text-live-fg' : 'bg-cladd-surface-cut text-cladd-fg-soft',
          )}
        >
          {live ? 'PROGRAM' : 'PREVIEW'}
        </span>
        <span className="min-w-0 truncate text-cladd-xs font-semibold">{screen.name}</span>
        <span className="ml-auto shrink-0 text-cladd-xs text-cladd-fg-softer tabular">
          {display ? `${display.width}×${display.height}` : '16:9'}
        </span>
      </div>
      <SurfaceCut
        wrapContent={false}
        className={cn(
          'rounded-cladd-sm p-[3px] transition-colors',
          live && 'shadow-[0_0_24px_-8px_var(--live)]',
        )}
        bgClassName={cn(live && 'bg-live', phase === 'preparing' && 'bg-warn/60')}
      >
        <ScreenRender
          screen={screen}
          aspect={aspect}
          {...content}
          cue={cue}
          cuePanelId={screen.cueTargetPanelId}
          className="relative w-full rounded-cladd-3xs"
        />
      </SurfaceCut>
      {!live && (
        <p className="text-cladd-xs leading-snug text-cladd-fg-softer">
          Not on air. This is what Go Live will show.
        </p>
      )}
    </section>
  );
}
