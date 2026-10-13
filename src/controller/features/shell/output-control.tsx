import { CircleStop, Loader2, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/picta/hint';
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

/** The one place that says whether the audience display is live, and changes it. */
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
          'flex h-7 items-center gap-2 rounded-md px-2.5 text-[11.5px] font-semibold tracking-[0.06em] whitespace-nowrap',
          phase === 'live' &&
            'bg-live text-live-fg shadow-[0_0_0_1px_rgb(255_255_255/0.12),0_0_18px_-4px_var(--live)]',
          phase === 'preparing' && 'bg-warn-soft text-warn',
          phase === 'stopping' && 'bg-raised text-fg-muted',
          phase === 'off' && (failure ? 'bg-danger-soft text-danger' : 'bg-raised text-fg-faint'),
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
        <Hint label="Blank and close the audience display">
          <Button
            variant="default"
            size="lg"
            disabled={phase === 'stopping'}
            onClick={() => void requestStopOutput()}
          >
            <CircleStop className="text-danger" />
            Stop
          </Button>
        </Hint>
      ) : (
        <Hint
          label={
            hasDisplay
              ? `Prepare the output hidden, then reveal ${armedName} when it is ready`
              : 'Choose an output display first'
          }
        >
          <Button
            variant="default"
            size="lg"
            disabled={phase === 'preparing' || !hasDisplay}
            onClick={() => void goLive()}
            className="border-live/50 pr-3"
          >
            <Radio className="text-live" />
            Go Live
          </Button>
        </Hint>
      )}
    </div>
  );
}
