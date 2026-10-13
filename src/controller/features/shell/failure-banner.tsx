import { OctagonX, Radio, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePicta } from '@/state/store';
import { dismissFailure, goLive } from '@/actions/output';

/** An output failure is never quiet: it stays here until dealt with. */
export function FailureBanner() {
  const failure = usePicta((state) => state.output.failure);
  const phase = usePicta((state) => state.output.phase);
  const canRetry = usePicta((state) => state.selectedDisplayId !== null);
  if (!failure || phase !== 'off') return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-danger/30 bg-danger-soft px-3 py-2"
    >
      <OctagonX className="size-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold text-fg">{failure.title}</p>
        <p className="text-[12px] text-fg-muted">{failure.detail}</p>
      </div>
      {canRetry && (
        <Button size="sm" onClick={() => void goLive()}>
          <Radio className="text-live" />
          Try Again
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={dismissFailure}>
        <X />
      </Button>
    </div>
  );
}
