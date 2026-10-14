import { useMemo } from 'react';
import { Button, List, ListButton, ListItem } from '@cladd-ui/react';
import { CircleAlert, CircleCheck, Info, Loader2, OctagonX, RefreshCw } from 'lucide-react';
import { SectionHeader } from '@/components/picta/workspace';
import { cn } from '@/lib/utils';
import { usePicta, usePictaShallow } from '@/state/store';
import { readiness, type ReadinessItem } from '@/state/derive';
import { refreshPreflight } from '@/actions/output';
import { setMode } from '@/actions/ui';

const ICONS = {
  ok: CircleCheck,
  warn: CircleAlert,
  block: OctagonX,
  info: Info,
};

const TONE = {
  ok: 'text-ok',
  warn: 'text-warn',
  block: 'text-danger',
  info: 'text-cladd-fg-softer',
};

/** Off air, the rail answers "what will happen when I press Go Live?" */
export function Readiness() {
  // Only what readiness depends on, so media positions and cue updates do not
  // re-render this list.
  const inputs = usePictaShallow((s) => ({
    doc: s.doc,
    armedScreenId: s.armedScreenId,
    displays: s.displays,
    selectedDisplayId: s.selectedDisplayId,
    controllerDisplayId: s.controllerDisplayId,
    displayAmbiguous: s.displayAmbiguous,
    preflight: s.preflight,
    pathStyle: s.pathStyle,
  }));
  const items = useMemo(() => readiness(inputs), [inputs]);
  const running = usePicta((s) => s.preflight.running);
  const hasMedia = usePicta((s) => (s.doc.show.data.media.data?.items.length ?? 0) > 0);

  const open = (item: ReadinessItem) => {
    if (item.id === 'media') setMode('media');
    if (item.id === 'team') setMode('roster');
  };

  return (
    <section aria-label="Ready to go live" className="flex flex-col gap-1">
      <SectionHeader
        label="Before going live"
        actions={
          hasMedia ? (
            <Button
              size="sm"
              variant="transparent"
              outline={false}
              disabled={running}
              onClick={() => void refreshPreflight()}
            >
              {running ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Check media
            </Button>
          ) : null
        }
      />
      <List className="gap-0.5 p-0">
        {items.map((item) => {
          const Icon = ICONS[item.level];
          const icon = <Icon className={cn('size-4 shrink-0 self-start', TONE[item.level])} />;
          const actionable = item.id === 'media' || item.id === 'team';
          return actionable ? (
            <ListButton
              key={item.id}
              icon={icon}
              footer={item.detail}
              onClick={() => open(item)}
              className="text-left"
            >
              {item.label}
            </ListButton>
          ) : (
            <ListItem key={item.id} className="min-h-0 items-start gap-2 px-2 py-1.5">
              {icon}
              <span className="min-w-0">
                <span className="block font-semibold">{item.label}</span>
                <span className="block text-cladd-fg-softer">{item.detail}</span>
              </span>
            </ListItem>
          );
        })}
      </List>
    </section>
  );
}
