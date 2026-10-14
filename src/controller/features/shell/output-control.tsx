import { Button } from '@cladd-ui/react';
import { CircleStop, Loader2, Radio } from 'lucide-react';
import { Hint } from '@/components/picta/hint';
import { HintWhenDisabled } from '@/components/picta/controls';
import { cn } from '@/lib/utils';
import { usePicta } from '@/state/store';
import { armedScreen, selectedDisplay } from '@/state/derive';
import { goLive, requestStopOutput } from '@/actions/output';
import { formatElapsed, useNow } from '@/use-now';
import type { PrepareStage } from '@/state/store';

export const STAGE_LABELS: Record<PrepareStage, string> = {
  'checking-display': 'Checking display',
  'checking-media': 'Checking media',
  'opening-window': 'Opening output',
  renderer: 'Waiting for renderer',
  screen: 'Mounting Screen',
  'initial-media': 'Loading first media',
  revealing: 'Revealing',
};

function Elapsed({ since }: { since: number }) {
  const now = useNow(1000);
  return <span className="tabular">{formatElapsed(now - since)}</span>;
}

/**
 * The one place that says whether the audience display is live, and changes
 * it. ON AIR is the only solid red in the application.
 */
export function OutputControl() {
  const phase = usePicta((state) => state.output.phase);
  const stage = usePicta((state) => state.output.stage);
  const startedAt = usePicta((state) => state.output.startedAt);
  const failure = usePicta((state) => state.output.failure);
  const armedName = usePicta((state) => armedScreen(state).name);
  const hasDisplay = usePicta((state) => selectedDisplay(state) !== null);

  return (
    <div className="flex items-center gap-2">
      <div
        role="status"
        aria-live="polite"
        aria-label={
          phase === 'live'
            ? 'On air'
            : phase === 'preparing'
              ? `Preparing output: ${stage ? STAGE_LABELS[stage] : ''}`
              : failure
                ? 'Off air: last start failed'
                : 'Off air'
        }
        className={cn(
          'flex h-cladd-md items-center gap-2 rounded-cladd-md px-2.5 text-cladd-xs font-semibold tracking-wider whitespace-nowrap',
          phase === 'live' &&
            'bg-live text-live-fg shadow-[0_0_0_1px_rgb(255_255_255/0.12),0_0_18px_-4px_var(--live)]',
          phase === 'preparing' && 'bg-warn/15 text-warn',
          phase === 'stopping' && 'bg-cladd-surface-cut text-cladd-fg-soft',
          phase === 'off' &&
            (failure ? 'bg-danger/15 text-danger' : 'bg-cladd-surface-cut text-cladd-fg-soft'),
        )}
      >
        {phase === 'live' && (
          <>
            <span className="size-2 animate-tally rounded-full bg-live-fg" />
            ON AIR
            {startedAt !== null && (
              <span className="font-medium tracking-normal opacity-85">
                <Elapsed since={startedAt} />
              </span>
            )}
          </>
        )}
        {phase === 'preparing' && (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            <span className="tracking-normal">{stage ? STAGE_LABELS[stage] : 'Preparing'}…</span>
          </>
        )}
        {phase === 'stopping' && 'STOPPING…'}
        {phase === 'off' && (failure ? 'START FAILED' : 'OFF AIR')}
      </div>
      {phase === 'live' || phase === 'stopping' ? (
        <Hint label="Blank and close the audience display" side="bottom">
          <Button
            size="lg"
            disabled={phase === 'stopping'}
            onClick={() => void requestStopOutput()}
          >
            <CircleStop className="text-danger" />
            Stop
          </Button>
        </Hint>
      ) : (
        <HintWhenDisabled
          label={
            hasDisplay
              ? `Prepare the output hidden, then reveal ${armedName} when it is ready`
              : 'Choose an output display first'
          }
        >
          <Button
            size="lg"
            disabled={phase === 'preparing' || !hasDisplay}
            onClick={() => void goLive()}
          >
            <Radio className="text-live" />
            Go Live
          </Button>
        </HintWhenDisabled>
      )}
    </div>
  );
}
