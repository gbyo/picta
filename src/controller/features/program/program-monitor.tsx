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
      <div className="flex h-6 items-center gap-2">
        <span
          className={cn(
            'rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold tracking-[0.1em]',
            live ? 'bg-live text-live-fg' : 'bg-raised text-fg-muted',
          )}
        >
          {live ? 'PROGRAM' : 'PREVIEW'}
        </span>
        <span className="min-w-0 truncate text-[12.5px] font-medium text-fg">{screen.name}</span>
        <span className="ml-auto shrink-0 text-[11px] text-fg-faint tabular">
          {display ? `${display.width}×${display.height}` : '16:9'}
        </span>
      </div>
      <div
        className={cn(
          'rounded-[5px] p-[3px] transition-colors',
          live ? 'bg-live shadow-[0_0_24px_-8px_var(--live)]' : 'bg-line-strong',
          phase === 'preparing' && 'bg-warn/60',
        )}
      >
        <ScreenRender
          screen={screen}
          aspect={aspect}
          {...content}
          cue={cue}
          cuePanelId={screen.cueTargetPanelId}
          className="w-full rounded-[3px]"
        />
      </div>
      {!live && (
        <p className="text-[11px] leading-snug text-fg-faint">
          Not on air. This is what Go Live will show.
        </p>
      )}
    </section>
  );
}
