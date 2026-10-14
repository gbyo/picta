import { useMemo } from 'react';
import { Check, Monitor, MonitorOff, ScanEye, TriangleAlert } from 'lucide-react';
import { describeDisplay, type DisplayInfo } from '@core/monitors.js';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { usePicta, usePictaShallow } from '@/state/store';
import { chooseDisplay, identifyDisplays } from '@/actions/output';

/** A scaled map of the desktop so "which TV is Display 2?" is answered visually. */
function Arrangement({
  displays,
  selectedId,
  controllerId,
  disabled,
}: {
  displays: DisplayInfo[];
  selectedId: string | null;
  controllerId: string | null;
  disabled: boolean;
}) {
  const bounds = useMemo(() => {
    const minX = Math.min(...displays.map((d) => d.x));
    const minY = Math.min(...displays.map((d) => d.y));
    const maxX = Math.max(...displays.map((d) => d.x + d.width));
    const maxY = Math.max(...displays.map((d) => d.y + d.height));
    const width = Math.max(1, maxX - minX);
    // Never let a single wide display collapse the map into a sliver.
    const height = Math.max(1, maxY - minY, width / 3.2);
    return { minX, minY, width, height };
  }, [displays]);
  return (
    <div
      className="relative w-full rounded-md bg-sunken"
      style={{ aspectRatio: `${bounds.width} / ${bounds.height}` }}
    >
      {displays.map((display) => {
        const selected = display.id === selectedId;
        return (
          <button
            key={display.id}
            type="button"
            disabled={disabled}
            onClick={() => chooseDisplay(display.id)}
            aria-label={`Display ${display.index}`}
            className={cn(
              'absolute flex flex-col items-center justify-center gap-0.5 rounded-[3px] border text-[11px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed',
              selected
                ? 'border-accent bg-accent-soft text-fg'
                : 'border-line-strong bg-raised text-fg-muted hover:bg-raised-hover hover:text-fg',
            )}
            style={{
              left: `${((display.x - bounds.minX) / bounds.width) * 100}%`,
              top: `${((display.y - bounds.minY) / bounds.height) * 100}%`,
              width: `calc(${(display.width / bounds.width) * 100}% - 4px)`,
              height: `calc(${(display.height / bounds.height) * 100}% - 4px)`,
            }}
          >
            <span className="text-[15px] font-semibold tabular">{display.index}</span>
            {display.id === controllerId && (
              <span className="text-[11px] text-fg-faint">Picta</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function DisplayPicker() {
  const { displays, selectedId, controllerId, phase, ambiguous } = usePictaShallow((state) => ({
    displays: state.displays,
    selectedId: state.selectedDisplayId,
    controllerId: state.controllerDisplayId,
    phase: state.output.phase,
    ambiguous: state.displayAmbiguous,
  }));
  const lost = usePicta((state) => state.lostDisplayHint);
  const selected = displays.find((display) => display.id === selectedId) ?? null;
  const locked = phase !== 'off';
  const sameAsController = selected !== null && selected.id === controllerId;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              'h-8 gap-2 px-2',
              !selected && 'text-warn hover:text-warn',
              sameAsController && !locked && 'text-warn',
            )}
            aria-label={
              selected ? `Output display: Display ${selected.index}` : 'Choose output display'
            }
          />
        }
      >
        {selected ? <Monitor className="size-4" /> : <MonitorOff className="size-4" />}
        <span className="flex flex-col items-start leading-none">
          <span className="text-[12px] font-medium">
            {selected ? `Display ${selected.index}` : 'No display'}
          </span>
          <span className="mt-0.5 text-[11px] font-normal text-fg-faint tabular">
            {selected ? `${selected.width}×${selected.height}` : 'Choose output'}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-3">
        <div className="flex items-center justify-between">
          <p className="label-caps">Audience display</p>
          <Button variant="ghost" size="sm" onClick={() => void identifyDisplays()}>
            <ScanEye />
            Identify
          </Button>
        </div>
        {displays.length === 0 ? (
          <p className="text-[12px] text-fg-muted">No displays were found.</p>
        ) : (
          <>
            <Arrangement
              displays={displays}
              selectedId={selectedId}
              controllerId={controllerId}
              disabled={locked}
            />
            <ul className="flex flex-col gap-px" role="listbox" aria-label="Displays">
              {displays.map((display) => {
                const isSelected = display.id === selectedId;
                return (
                  <li key={display.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={locked}
                      onClick={() => chooseDisplay(display.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-raised-hover focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:hover:bg-transparent',
                        isSelected && 'bg-raised',
                      )}
                    >
                      <span className="flex size-6 items-center justify-center rounded-[4px] bg-sunken text-[12px] font-semibold tabular">
                        {display.index}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-fg">
                          {display.name?.trim() || `Display ${display.index}`}
                        </span>
                        <span className="block truncate text-[11px] text-fg-faint">
                          {describeDisplay(display).split(' · ').slice(1).join(' · ')}
                          {display.id === controllerId ? ' · Picta is here' : ''}
                        </span>
                      </span>
                      {isSelected && <Check className="size-4 text-accent" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {locked && (
          <p className="text-[11.5px] text-fg-muted">Stop output to choose a different display.</p>
        )}
        {!locked && sameAsController && (
          <p className="flex gap-1.5 text-[11.5px] text-warn">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            This is the display Picta is on. The output would cover this window.
          </p>
        )}
        {!locked && ambiguous && !selected && (
          <p className="text-[11.5px] text-warn">
            Two identical displays are connected, so Picta will not guess. Use Identify, then choose
            one.
          </p>
        )}
        {!locked && lost && !selected && (
          <p className="text-[11.5px] text-fg-muted">
            Waiting for the previous display to come back. Picta will select it when it can identify
            it exactly.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
