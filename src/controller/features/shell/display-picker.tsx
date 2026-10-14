import { useMemo } from 'react';
import { Button, List, ListButton, SectionTitle, Surface, SurfaceCut } from '@cladd-ui/react';
import { Check, Monitor, MonitorOff, ScanEye } from 'lucide-react';
import { describeDisplay, type DisplayInfo } from '@core/monitors.js';
import { Banner } from '@/components/picta/feedback';
import { PictaPopover } from '@/components/picta/popover';
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
    <SurfaceCut
      wrapContent={false}
      className="relative w-full rounded-cladd-md"
      style={{ aspectRatio: `${bounds.width} / ${bounds.height}` }}
    >
      {displays.map((display) => {
        const selected = display.id === selectedId;
        return (
          <Surface
            key={display.id}
            as="button"
            type="button"
            disabled={disabled}
            hoverable={!disabled}
            clickable={!disabled}
            outline
            variant={selected ? 'gradient' : 'solid'}
            color={selected ? 'brand' : ''}
            onClick={() => chooseDisplay(display.id)}
            aria-label={`Display ${display.index}`}
            aria-pressed={selected}
            className="focus-ring absolute rounded-cladd-xs disabled:opacity-60"
            contentClassName="flex h-full flex-col items-center justify-center gap-0.5"
            style={{
              left: `${((display.x - bounds.minX) / bounds.width) * 100}%`,
              top: `${((display.y - bounds.minY) / bounds.height) * 100}%`,
              width: `calc(${(display.width / bounds.width) * 100}% - 4px)`,
              height: `calc(${(display.height / bounds.height) * 100}% - 4px)`,
            }}
          >
            <span
              className={cn(
                'text-cladd-md font-semibold tabular',
                selected && 'text-cladd-primary',
              )}
            >
              {display.index}
            </span>
            {display.id === controllerId && (
              <span className="text-cladd-2xs text-cladd-fg-softer">Picta</span>
            )}
          </Surface>
        );
      })}
    </SurfaceCut>
  );
}

/**
 * Choosing the audience display is a quick anchored decision made right
 * before Go Live, so it stays a popover (not a modal sheet) with the
 * topology map first, the list as the keyboard path, and at most one notice.
 */
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

  const notice = locked
    ? ({ tone: 'info', text: 'Stop output to choose a different display.' } as const)
    : sameAsController
      ? ({
          tone: 'warn',
          text: 'This is the display Picta is on. The output would cover this window.',
        } as const)
      : ambiguous && !selected
        ? ({
            tone: 'warn',
            text: 'Two identical displays are connected, so Picta will not guess. Use Identify, then choose one.',
          } as const)
        : lost && !selected
          ? ({
              tone: 'info',
              text: 'Waiting for the previous display to come back. Picta will select it when it can identify it exactly.',
            } as const)
          : null;

  return (
    <PictaPopover
      label="Audience display"
      position="bottom-end"
      width="md"
      initialFocus='[role="option"][aria-selected="true"], [role="option"]'
      contentClassName="gap-3 p-3"
      trigger={
        <Button
          variant="transparent"
          outline={false}
          color={!selected || (sameAsController && !locked) ? 'warn' : ''}
          aria-label={
            selected ? `Output display: Display ${selected.index}` : 'Choose output display'
          }
        >
          {selected ? <Monitor /> : <MonitorOff />}
          <span className="flex flex-col items-start leading-none">
            <span>{selected ? `Display ${selected.index}` : 'No display'}</span>
            <span className="mt-0.5 text-cladd-2xs font-normal text-cladd-fg-soft tabular">
              {selected ? `${selected.width}×${selected.height}` : 'Choose output'}
            </span>
          </span>
        </Button>
      }
    >
      <SectionTitle className="items-center">
        <span className="flex-1">Audience display</span>
        <Button
          size="sm"
          variant="transparent"
          outline={false}
          onClick={() => void identifyDisplays()}
        >
          <ScanEye />
          Identify
        </Button>
      </SectionTitle>
      {displays.length === 0 ? (
        <p className="text-cladd-xs text-cladd-fg-soft">No displays were found.</p>
      ) : (
        <>
          <Arrangement
            displays={displays}
            selectedId={selectedId}
            controllerId={controllerId}
            disabled={locked}
          />
          <List role="listbox" aria-label="Displays" className="gap-0.5 p-0">
            {displays.map((display) => {
              const isSelected = display.id === selectedId;
              return (
                <ListButton
                  key={display.id}
                  role="option"
                  aria-selected={isSelected}
                  disabled={locked}
                  selected={isSelected}
                  onClick={() => chooseDisplay(display.id)}
                  icon={<span className="w-4 text-center tabular">{display.index}</span>}
                  footer={
                    describeDisplay(display).split(' · ').slice(1).join(' · ') +
                    (display.id === controllerId ? ' · Picta is here' : '')
                  }
                  after={isSelected ? <Check className="text-cladd-primary" /> : undefined}
                >
                  {display.name?.trim() || `Display ${display.index}`}
                </ListButton>
              );
            })}
          </List>
        </>
      )}
      {notice && (
        <Banner tone={notice.tone} variant="inline" className="items-start">
          {notice.text}
        </Banner>
      )}
    </PictaPopover>
  );
}
