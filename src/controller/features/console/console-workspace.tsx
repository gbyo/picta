import { Tab, TabPanel, Tabs, TabsList } from '@cladd-ui/react';
import { ChartColumn, Clapperboard } from 'lucide-react';
import { SectionHeader, Workspace } from '@/components/picta/workspace';
import { StatusDot } from '@/components/picta/feedback';
import { usePicta } from '@/state/store';
import { scoreInUse } from '@/state/derive';
import { setConsoleTab } from '@/actions/ui';
import { useWidth } from '@/use-width';
import { ScoreController } from './score-controller';
import { StatsDeck } from './stats-deck';
import { CueDeck } from './cue-deck';

/**
 * The live console: the match on top, then live statistics and player cues.
 * On a wide window stats and cues sit side by side; otherwise they share tabs.
 */
export function ConsoleWorkspace() {
  const showScore = usePicta((state) => scoreInUse(state.doc.show.data));
  const tab = usePicta((state) => state.consoleTab);
  const cueActive = usePicta((state) => state.output.cue.state.active || state.manual !== null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const sideBySide = width >= 1060;

  return (
    <Workspace ref={ref} className="gap-3 p-3 pt-2">
      {showScore && <ScoreController />}
      {sideBySide ? (
        <div className="flex min-h-0 flex-1 gap-4 border-t pt-2">
          <section aria-label="Stats" className="flex min-h-0 flex-[3] flex-col">
            <SectionHeader label="Stats" />
            <div className="min-h-0 flex-1">
              <StatsDeck />
            </div>
          </section>
          <section aria-label="Cues" className="flex min-h-0 flex-[2] flex-col border-l pl-4">
            <SectionHeader label="Cues" />
            <div className="min-h-0 flex-1">
              <CueDeck />
            </div>
          </section>
        </div>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => setConsoleTab(value === 'cues' ? 'cues' : 'stats')}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-2 border-t pt-2">
            <TabsList className="shrink-0 self-start">
              <Tab value="stats">
                <ChartColumn />
                Stats
              </Tab>
              <Tab value="cues">
                <Clapperboard />
                Cues
                {cueActive && <StatusDot tone="cue" className="size-1.5" />}
              </Tab>
            </TabsList>
            <TabPanel value="stats" className="min-h-0 flex-1 outline-none">
              <StatsDeck />
            </TabPanel>
            <TabPanel value="cues" className="min-h-0 flex-1 outline-none">
              <CueDeck />
            </TabPanel>
          </div>
        </Tabs>
      )}
    </Workspace>
  );
}
