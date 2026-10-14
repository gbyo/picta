import { Panel, Scroll } from '@/components/picta/workspace';
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
    <Panel as="aside" aria-label="Program" className="h-full" contentClassName="gap-3 p-3">
      <ProgramMonitor />
      <CueStrip />
      <ScreenSwitcher />
      <div className="h-px shrink-0 bg-cladd-outline" />
      {phase === 'live' ? (
        <MediaTransport />
      ) : (
        <Scroll>
          <Readiness />
        </Scroll>
      )}
    </Panel>
  );
}
