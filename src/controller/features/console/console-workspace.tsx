import { ChartColumn, Clapperboard } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePicta } from '@/state/store';
import { scoreInUse } from '@/state/derive';
import { setConsoleTab } from '@/actions/ui';
import { useWidth } from '@/use-width';
import { ScoreController } from './score-controller';
import { StatsDeck } from './stats-deck';
import { CueDeck } from './cue-deck';
import { SectionHeader } from '@/components/picta/section';

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
    <div ref={ref} className="flex h-full min-h-0 flex-col gap-3 p-3 pt-2">
      {showScore && <ScoreController />}
      {sideBySide ? (
        <div className="flex min-h-0 flex-1 gap-4 border-t border-line pt-2">
          <section aria-label="Stats" className="flex min-h-0 flex-[3] flex-col">
            <SectionHeader label="Stats" />
            <div className="min-h-0 flex-1">
              <StatsDeck />
            </div>
          </section>
          <section
            aria-label="Cues"
            className="flex min-h-0 flex-[2] flex-col border-l border-line pl-4"
          >
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
          className="min-h-0 flex-1 border-t border-line"
        >
          <TabsList className="shrink-0">
            <TabsTrigger value="stats">
              <ChartColumn />
              Stats
            </TabsTrigger>
            <TabsTrigger value="cues">
              <Clapperboard />
              Cues
              {cueActive && (
                <span className="size-1.5 rounded-full bg-cue" aria-label="Cue active" />
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="stats" className="pt-2">
            <StatsDeck />
          </TabsContent>
          <TabsContent value="cues" className="pt-2">
            <CueDeck />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
