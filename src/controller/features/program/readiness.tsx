import { CircleAlert, CircleCheck, Info, Loader2, OctagonX, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/picta/section';
import { cn } from '@/lib/utils';
import { usePicta, usePictaShallow } from '@/state/store';
import { readiness, type ReadinessItem } from '@/state/derive';
import { refreshPreflight } from '@/actions/output';
import { setMode } from '@/actions/ui';
import { useMemo } from 'react';

const ICONS = {
  ok: CircleCheck,
  warn: CircleAlert,
  block: OctagonX,
  info: Info,
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
              variant="ghost"
              size="sm"
              disabled={running}
              onClick={() => void refreshPreflight()}
            >
              {running ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Check media
            </Button>
          ) : null
        }
      />
      <ul className="flex flex-col gap-px">
        {items.map((item) => {
          const Icon = ICONS[item.level];
          const actionable = item.id === 'media' || item.id === 'team';
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={!actionable}
                onClick={() => open(item)}
                className="flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left outline-none enabled:hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Icon
                  className={cn(
                    'mt-px size-3.5 shrink-0',
                    item.level === 'ok' && 'text-ok',
                    item.level === 'warn' && 'text-warn',
                    item.level === 'block' && 'text-danger',
                    item.level === 'info' && 'text-fg-faint',
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-[12px] text-fg">{item.label}</span>
                  <span className="block text-[11px] leading-snug text-fg-faint">
                    {item.detail}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
