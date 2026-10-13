import { useState } from 'react';
import {
  Copy,
  GripVertical,
  Info,
  LayoutTemplate,
  Plus,
  Radio,
  Scan,
  Star,
  Trash2,
} from 'lucide-react';
import type { PanelContent, Screen, ShowBackground } from '@core/domain.js';
import {
  SCREEN_TEMPLATES,
  screenFromTemplate,
  screenTemplateId,
  type ScreenTemplateId,
} from '@core/screens.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Hint } from '@/components/picta/hint';
import { LayoutGlyph } from '@/components/picta/layout-glyph';
import { CONTENT_META } from '@/components/picta/content-meta';
import { ScreenRender } from '@/components/picta/screen-render';
import { SortableArea, useSortableItem } from '@/components/picta/sortable';
import { cn } from '@/lib/utils';
import { usePicta, usePictaShallow } from '@/state/store';
import { boardGroupFor, panelPlace } from '@/state/derive';
import { useDisplayAspect, useProgramMediaItem, useScreenContent, useTeam } from '@/hooks';
import { selectScreen } from '@/actions/output';
import { toggleSafeArea } from '@/actions/ui';
import {
  applyTemplate,
  createScreen,
  deleteScreen,
  duplicateScreen,
  editScreen,
  moveScreen,
  nudgeScreen,
  promptRenameScreen,
  renameScreen,
  selectPanel,
  setDefaultScreen,
  setPanelContent,
  setPanelStatsGroup,
  setScreenBackground,
} from '@/actions/screens';

type Template = Exclude<ScreenTemplateId, 'imported'>;

const TEMPLATE_LABELS: Record<Template, string> = {
  full: 'Full',
  'half-left-right': '50 / 50',
  '65-35-left-right': '65 / 35',
  '35-65-left-right': '35 / 65',
  'half-top-bottom': 'Top / Bottom',
};

const PREVIEW_TEMPLATES = Object.fromEntries(
  SCREEN_TEMPLATES.map((id) => [
    id,
    screenFromTemplate(id, id, id, [{ kind: 'blank' }, { kind: 'blank' }]),
  ]),
) as Record<Template, Screen>;

function ScreenListItem({
  screen,
  index,
  count,
}: {
  screen: Screen;
  index: number;
  count: number;
}) {
  const sortable = useSortableItem(screen.id);
  const { editingId, defaultId, liveId } = usePictaShallow((state) => ({
    editingId: state.editingScreenId ?? state.armedScreenId,
    defaultId: state.doc.show.data.defaultScreenId,
    liveId: state.output.liveScreenId,
  }));
  const selected = screen.id === editingId;
  const live = screen.id === liveId;
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <li
            ref={sortable.ref}
            style={sortable.style}
            className={cn(
              'flex items-center gap-1.5 rounded-md border pr-1 transition-colors',
              selected ? 'border-accent/70 bg-accent-soft' : 'border-transparent hover:bg-raised',
              sortable.dragging && 'bg-raised shadow-pop',
            )}
          />
        }
      >
        <button
          type="button"
          ref={sortable.handleRef}
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={`Reorder ${screen.name}`}
          onKeyDown={(event) => {
            if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
              event.preventDefault();
              event.stopPropagation();
              nudgeScreen(screen.id, event.key === 'ArrowUp' ? -1 : 1);
              return;
            }
            // Keep dnd-kit's keyboard reordering (Space, arrows, Space).
            sortable.listeners?.['onKeyDown']?.(event);
          }}
          className="flex h-10 w-5 cursor-grab items-center justify-center rounded-[4px] text-fg-faint outline-none hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-accent"
        >
          <GripVertical className="size-3.5" />
        </button>
        <button
          type="button"
          aria-current={selected}
          onClick={() => editScreen(screen.id)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <LayoutGlyph screen={screen} className="w-10" tone={live ? 'live' : 'default'} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">
              <span className="truncate text-[12.5px] font-medium text-fg">{screen.name}</span>
              {screen.id === defaultId && (
                <Star
                  className="size-2.5 shrink-0 fill-fg-faint text-fg-faint"
                  aria-label="Default Screen"
                />
              )}
            </span>
            <span
              className={cn(
                'block text-[10.5px]',
                live ? 'font-semibold text-live' : 'text-fg-faint',
              )}
            >
              {live ? 'ON AIR' : `Key ${index + 1}`}
            </span>
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={() => void promptRenameScreen(screen.id)}>
          Rename…
        </ContextMenuItem>
        <ContextMenuItem onClick={() => duplicateScreen(screen.id)}>Duplicate</ContextMenuItem>
        <ContextMenuItem disabled={index === 0} onClick={() => nudgeScreen(screen.id, -1)}>
          Move Up
        </ContextMenuItem>
        <ContextMenuItem disabled={index === count - 1} onClick={() => nudgeScreen(screen.id, 1)}>
          Move Down
        </ContextMenuItem>
        <ContextMenuItem
          disabled={screen.id === defaultId}
          onClick={() => setDefaultScreen(screen.id)}
        >
          Make Default
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          disabled={live}
          onClick={() => deleteScreen(screen.id)}
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function NameField({ screen }: { screen: Screen }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Input
        aria-label="Screen name"
        value={draft ?? screen.name}
        maxLength={40}
        aria-invalid={error !== null}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setError(null);
        }}
        onBlur={() => {
          if (draft === null) return;
          const problem = renameScreen(screen.id, draft);
          if (problem) setError(problem);
          else setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(null);
            setError(null);
          }
        }}
        className="text-[13px] font-semibold"
      />
      {error && <p className="text-[11.5px] text-danger">{error}</p>}
    </div>
  );
}

function Inspector({ screen }: { screen: Screen }) {
  const team = useTeam();
  const selectedPanelId = usePicta((state) => state.selectedPanelId);
  const defaultId = usePicta((state) => state.doc.show.data.defaultScreenId);
  const liveId = usePicta((state) => state.output.liveScreenId);
  const template = screenTemplateId(screen);
  const panelIndex = Math.max(
    0,
    screen.panels.findIndex((panel) => panel.id === selectedPanelId),
  );
  const panel = screen.panels[panelIndex]!;
  const hasOtherMedia = screen.panels.some(
    (item) => item.id !== panel.id && item.content.kind === 'media',
  );
  const backgrounds: { kind: ShowBackground['kind']; label: string; color: string }[] = [
    { kind: 'black', label: 'Black', color: '#000000' },
    { kind: 'primary', label: 'Team primary', color: team?.colors.primary ?? '#111111' },
    { kind: 'secondary', label: 'Team secondary', color: team?.colors.secondary ?? '#ffffff' },
  ];
  return (
    <div className="flex flex-col gap-5 p-4">
      <section className="flex flex-col gap-2">
        <h3 className="label-caps">Screen</h3>
        <NameField key={screen.id} screen={screen} />
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="label-caps">Layout</h3>
        {template === 'imported' && (
          <p className="flex gap-1.5 rounded-md bg-warn-soft px-2.5 py-2 text-[11.5px] leading-snug text-fg">
            <Info className="mt-px size-3.5 shrink-0 text-warn" />
            Imported from an older show with {screen.panels.length} panels. It is kept exactly until
            you choose a template below, which resets it.
          </p>
        )}
        <div className="grid grid-cols-3 gap-1.5">
          {SCREEN_TEMPLATES.map((id) => (
            <Hint
              key={id}
              label={id === template ? 'Current layout' : `Use the ${TEMPLATE_LABELS[id]} layout`}
            >
              <button
                type="button"
                aria-pressed={id === template}
                aria-label={`${TEMPLATE_LABELS[id]} layout`}
                onClick={() => {
                  if (id !== template) applyTemplate(screen.id, id);
                }}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md border p-1.5 text-[10.5px] outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  id === template
                    ? 'border-accent bg-accent-soft text-fg'
                    : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                )}
              >
                <LayoutGlyph screen={PREVIEW_TEMPLATES[id]} className="w-full" />
                {TEMPLATE_LABELS[id]}
              </button>
            </Hint>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="label-caps">
          {panelPlace(screen, panelIndex)} panel
          {screen.panels.length > 1 ? ` · ${panelIndex + 1} of ${screen.panels.length}` : ''}
        </h3>
        <div role="group" aria-label="Panel content" className="grid grid-cols-2 gap-1.5">
          {(Object.keys(CONTENT_META) as PanelContent['kind'][]).map((kind) => {
            const meta = CONTENT_META[kind];
            const active = panel.content.kind === kind;
            return (
              <Hint
                key={kind}
                label={
                  kind === 'media' && hasOtherMedia && !active
                    ? 'Moves the rotation here from the other panel'
                    : meta.hint
                }
              >
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPanelContent(screen.id, panel.id, kind)}
                  className={cn(
                    'flex h-9 items-center gap-2 rounded-md border px-2.5 text-[12px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    active
                      ? 'border-accent bg-accent-soft text-fg'
                      : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                  )}
                >
                  <meta.icon className="size-3.5" />
                  {meta.label}
                </button>
              </Hint>
            );
          })}
        </div>
        {panel.content.kind === 'stats' &&
          (team ? (
            <label className="flex flex-col gap-1 text-[11.5px] text-fg-muted">
              Shows the group
              <Select
                value={boardGroupFor(screen, team)?.id ?? ''}
                onValueChange={(value) => setPanelStatsGroup(screen.id, panel.id, String(value))}
              >
                <SelectTrigger className="w-full" aria-label="Stats group">
                  <SelectValue>
                    {(value: string) =>
                      team.groups.find((group) => group.id === value)?.name ?? 'Choose a group'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {team.groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-fg-faint">
                Substitutions in the Console change who appears.
              </span>
            </label>
          ) : (
            <p className="text-[11.5px] text-warn">Stats needs a team. Add one in Roster.</p>
          ))}
        {panel.content.kind === 'media' && (
          <p className="text-[11.5px] leading-snug text-fg-faint">
            The media rotation plays here, and player cues appear here.
          </p>
        )}
        {!screen.panels.some((item) => item.content.kind === 'media') && (
          <p className="text-[11.5px] leading-snug text-fg-faint">
            No media panel: the rotation pauses on this Screen and cues cover the full display.
          </p>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="label-caps">Background</h3>
        <ToggleGroup
          value={[screen.background.kind]}
          onValueChange={(value) => {
            const next = value[0] as ShowBackground['kind'] | undefined;
            if (next) setScreenBackground(screen.id, next);
          }}
          className="h-8 w-full"
        >
          {backgrounds.map((item) => (
            <Hint
              key={item.kind}
              label={`${item.label}${item.kind !== 'black' && !team ? ' (no team loaded)' : ''}`}
            >
              <ToggleGroupItem value={item.kind} className="flex-1" aria-label={item.label}>
                <span
                  className="size-3 rounded-[3px] ring-1 ring-line-strong"
                  style={{ background: item.color }}
                />
                {item.kind === 'black'
                  ? 'Black'
                  : item.kind === 'primary'
                    ? 'Primary'
                    : 'Secondary'}
              </ToggleGroupItem>
            </Hint>
          ))}
        </ToggleGroup>
        <p className="text-[11px] text-fg-faint">
          Shows behind Blank panels and around letterboxed media.
        </p>
      </section>
      <section className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => duplicateScreen(screen.id)}>
          <Copy />
          Duplicate
        </Button>
        <Button
          size="sm"
          disabled={screen.id === defaultId}
          onClick={() => setDefaultScreen(screen.id)}
        >
          <Star />
          {screen.id === defaultId ? 'Default Screen' : 'Make Default'}
        </Button>
        <Hint
          label={
            screen.id === liveId
              ? 'Switch to another Screen first'
              : 'Delete this Screen (Undo is offered)'
          }
        >
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:text-danger"
            disabled={screen.id === liveId}
            onClick={() => deleteScreen(screen.id)}
          >
            <Trash2 />
            Delete
          </Button>
        </Hint>
      </section>
    </div>
  );
}

function Canvas({ screen }: { screen: Screen }) {
  const aspect = useDisplayAspect();
  const mediaItem = useProgramMediaItem();
  const content = useScreenContent(screen, mediaItem);
  const selectedPanelId = usePicta((state) => state.selectedPanelId);
  const safe = usePicta((state) => state.showSafeArea);
  const live = usePicta(
    (state) => state.output.phase === 'live' && state.output.liveScreenId === screen.id,
  );
  const isLiveOutput = usePicta((state) => state.output.phase === 'live');
  const display = usePicta((state) =>
    state.displays.find((item) => item.id === state.selectedDisplayId),
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="text-[12px] text-fg-muted">
          {display
            ? `Display ${display.index} · ${display.width}×${display.height}`
            : '16:9 preview'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Hint label="Show a title-safe margin inside each panel (preview only, never saved)">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={safe}
              onClick={toggleSafeArea}
              className={cn(safe && 'text-warn')}
            >
              <Scan />
              Safe area
            </Button>
          </Hint>
          {isLiveOutput && !live && (
            <Button size="sm" onClick={() => selectScreen(screen.id)}>
              <Radio className="text-live" />
              Switch Display to This Screen
            </Button>
          )}
        </div>
      </div>
      {live && (
        <p className="flex items-center gap-2 border-b border-line bg-live-soft px-3 py-1.5 text-[12px] text-fg">
          <span className="size-2 rounded-full bg-live" />
          This Screen is on air. Changes appear on the audience display immediately.
        </p>
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center bg-sunken/40 p-6">
        <div
          className={cn('w-full rounded-[4px] p-[3px]', live ? 'bg-live' : 'bg-line-strong')}
          style={{ maxWidth: `min(100%, calc((100vh - 260px) * ${aspect}))` }}
        >
          <ScreenRender
            screen={screen}
            aspect={aspect}
            {...content}
            selectedPanelId={selectedPanelId ?? screen.panels[0]?.id ?? null}
            onSelectPanel={selectPanel}
            showSafeArea={safe}
            panelLabel={(panel, index) =>
              `${panelPlace(screen, index)} · ${CONTENT_META[panel.content.kind].label}`
            }
            className="w-full rounded-[2px]"
          />
        </div>
      </div>
    </div>
  );
}

/** Design what the audience sees: Screens, their layout, and what each panel shows. */
export function ScreensWorkspace() {
  const screens = usePicta((state) => state.doc.show.data.screens);
  const editingId = usePicta(
    (state) => state.editingScreenId ?? state.output.liveScreenId ?? state.armedScreenId,
  );
  const screen = screens.find((item) => item.id === editingId) ?? screens[0]!;
  return (
    <div className="flex h-full min-h-0">
      <aside
        aria-label="Screens"
        className="flex w-56 shrink-0 flex-col border-r border-line bg-surface"
      >
        <div className="flex h-10 items-center justify-between border-b border-line pr-1.5 pl-3">
          <h2 className="label-caps">Screens</h2>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
              <Plus />
              New
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Start from a layout</DropdownMenuLabel>
              {SCREEN_TEMPLATES.map((id) => (
                <DropdownMenuItem key={id} onClick={() => createScreen(id)}>
                  <LayoutGlyph screen={PREVIEW_TEMPLATES[id]} className="w-8" />
                  {TEMPLATE_LABELS[id]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <SortableArea ids={screens.map((item) => item.id)} onMove={moveScreen}>
            <ol className="flex flex-col gap-0.5 p-1.5" aria-label="Screens in switcher order">
              {screens.map((item, index) => (
                <ScreenListItem key={item.id} screen={item} index={index} count={screens.length} />
              ))}
            </ol>
          </SortableArea>
        </ScrollArea>
        <p className="border-t border-line px-3 py-2 text-[11px] leading-snug text-fg-faint">
          <LayoutTemplate className="mr-1 inline size-3" />
          Order here is the switcher order and number keys.
        </p>
      </aside>
      <div className="min-w-0 flex-1">
        <Canvas screen={screen} />
      </div>
      <aside
        aria-label="Screen inspector"
        className="w-72 shrink-0 border-l border-line bg-surface max-[1150px]:w-60"
      >
        <ScrollArea className="h-full">
          <Inspector screen={screen} />
        </ScrollArea>
      </aside>
    </div>
  );
}
