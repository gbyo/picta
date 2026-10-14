import { Button } from '@cladd-ui/react';
import { Radio, X } from 'lucide-react';
import { Banner } from '@/components/picta/feedback';
import { IconButton } from '@/components/picta/controls';
import { usePicta } from '@/state/store';
import { dismissFailure, goLive } from '@/actions/output';

/** An output failure is never quiet: it stays here until dealt with. */
export function FailureBanner() {
  const failure = usePicta((state) => state.output.failure);
  const phase = usePicta((state) => state.output.phase);
  const canRetry = usePicta((state) => state.selectedDisplayId !== null);
  if (!failure || phase !== 'off') return null;
  return (
    <Banner
      tone="danger"
      role="alert"
      className="py-2"
      actions={
        <>
          {canRetry && (
            <Button onClick={() => void goLive()}>
              <Radio className="text-live" />
              Try Again
            </Button>
          )}
          <IconButton label="Dismiss" onClick={dismissFailure}>
            <X />
          </IconButton>
        </>
      }
    >
      <p className="text-cladd-xs font-semibold">{failure.title}</p>
      <p className="text-cladd-xs text-cladd-fg-soft">{failure.detail}</p>
    </Banner>
  );
}
