import { Pencil, Star } from 'lucide-react';
import { usePicta, usePictaShallow } from '@/state/store';
import { cn } from '@/lib/utils';
import { LayoutGlyph } from '@/components/picta/layout-glyph';
import { SectionHeader } from '@/components/picta/section';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Hint } from '@/components/picta/hint';
import { selectScreen } from '@/actions/output';
import { editScreen, setDefaultScreen } from '@/actions/screens';

/**
 * One click switches the audience display while live; off air the same click
 * chooses which Screen Go Live starts with. Number keys do the same.
 */
export function ScreenSwitcher() {
  const { screens, defaultId, liveId, armedId, phase } = usePictaShallow((state) => ({
    screens: state.doc.show.data.screens,
    defaultId: state.doc.show.data.defaultScreenId,
    liveId: state.output.liveScreenId,
    armedId: state.armedScreenId,
    phase: state.output.phase,
  }));
  const live = phase === 'live';
  const locked = phase === 'preparing' || phase === 'stopping';
  const currentId = live ? liveId : armedId;
  const compact = usePicta((state) => state.doc.show.data.screens.length > 6);

  return (
    <section aria-label="Screens" className="flex flex-col gap-1">
      <SectionHeader
        label="Screens"
        detail={live ? 'Click to switch the display' : 'Click to choose what goes live'}
        actions={
          <Hint label="Edit Screens">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Edit Screens"
              onClick={() => editScreen(currentId)}
            >
              <Pencil />
            </Button>
          </Hint>
        }
      />
      <div
        role="group"
        aria-label={live ? 'Live Screen' : 'Screen to go live with'}
        className={cn('grid gap-1.5', compact ? 'grid-cols-3' : 'grid-cols-2')}
      >
        {screens.map((screen, index) => {
          const isCurrent = screen.id === currentId;
          const isLive = live && screen.id === liveId;
          return (
            <ContextMenu key={screen.id}>
              <ContextMenuTrigger
                render={
                  <button
                    type="button"
                    aria-pressed={isCurrent}
                    disabled={locked}
                    onClick={() => selectScreen(screen.id)}
                    className={cn(
                      'group relative flex min-w-0 items-center gap-2 rounded-md border p-1.5 pr-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50',
                      isLive
                        ? 'border-live bg-live-soft'
                        : isCurrent
                          ? 'border-accent/70 bg-accent-soft'
                          : 'border-line bg-raised hover:border-line-strong hover:bg-raised-hover',
                    )}
                  />
                }
              >
                <LayoutGlyph
                  screen={screen}
                  tone={isLive ? 'live' : isCurrent ? 'armed' : 'default'}
                  className={compact ? 'w-9' : 'w-11'}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="truncate text-[12px] font-medium text-fg">{screen.name}</span>
                    {screen.id === defaultId && (
                      <Star
                        className="size-2.5 shrink-0 fill-fg-faint text-fg-faint"
                        aria-label="Default"
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      'block text-[10px] font-semibold tracking-[0.08em]',
                      isLive ? 'text-live' : isCurrent ? 'text-accent' : 'text-transparent',
                    )}
                  >
                    {isLive ? 'ON AIR' : isCurrent ? (live ? '' : 'GOES LIVE') : '·'}
                  </span>
                </span>
                {index < 9 && (
                  <kbd className="absolute top-1 right-1.5 text-[10px] font-medium text-fg-faint tabular">
                    {index + 1}
                  </kbd>
                )}
              </ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                <ContextMenuItem disabled={locked} onClick={() => selectScreen(screen.id)}>
                  {live ? 'Switch to This Screen' : 'Go Live With This Screen'}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => editScreen(screen.id)}>
                  Edit Screen…
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={screen.id === defaultId}
                  onClick={() => setDefaultScreen(screen.id)}
                >
                  Make Default
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </section>
  );
}
