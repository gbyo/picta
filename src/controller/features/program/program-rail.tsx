import { ScrollArea } from '@/components/ui/scroll-area';
import { usePicta } from '@/state/store';
import { CueStrip } from './cue-strip';
import { MediaTransport } from './media-transport';
import { ProgramMonitor } from './program-monitor';
import { Readiness } from './readiness';
import { ScreenSwitcher } from './screen-switcher';

/**
 * The persistent left column. Whatever workspace is open, the operator can
 * see what the audience sees, switch Screens and drive the rotation.
 */
export function ProgramRail() {
  const phase = usePicta((state) => state.output.phase);
  return (
    <aside aria-label="Program" className="flex h-full min-h-0 flex-col gap-3 bg-surface p-3">
      <ProgramMonitor />
      <CueStrip />
      <ScreenSwitcher />
      <div className="h-px shrink-0 bg-line" />
      {phase === 'live' ? (
        <MediaTransport />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <Readiness />
        </ScrollArea>
      )}
    </aside>
  );
}
