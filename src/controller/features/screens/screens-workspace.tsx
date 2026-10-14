import { useState } from 'react';
import {
  Button,
  Input,
  Select,
  Surface,
  SurfaceCut,
  ToggleButton,
  ToolbarButton,
} from '@cladd-ui/react';
import { Copy, GripVertical, Plus, Radio, Scan, Star, Trash2 } from 'lucide-react';
import type { PanelContent, Screen, ShowBackground } from '@core/domain.js';
import {
  SCREEN_TEMPLATES,
  screenFromTemplate,
  screenTemplateId,
  type ScreenTemplateId,
} from '@core/screens.js';
import { ActionButton, Choice, Field } from '@/components/picta/controls';
import { Banner } from '@/components/picta/feedback';
import { Hint } from '@/components/picta/hint';
import { LayoutGlyph } from '@/components/picta/layout-glyph';
import { CONTENT_META } from '@/components/picta/content-meta';
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuTrigger,
  ContextActions,
  ContextActionsContent,
  ContextActionsTrigger,
  MenuItem,
  MenuSeparator,
  MenuTitle,
} from '@/components/picta/menu';
import { ScreenRender } from '@/components/picta/screen-render';
import { SortableArea, useSortableItem } from '@/components/picta/sortable';
import {
  Inspector,
  InspectorHeader,
  InspectorSection,
  Panel,
  PropertyRow,
  Scroll,
  SectionHeader,
  SelectableRow,
  Workspace,
  WorkspaceBody,
  WorkspaceMain,
  WorkspaceToolbar,
} from '@/components/picta/workspace';
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
    <ContextActions>
      <ContextActionsTrigger
        render={
          <SelectableRow
            as="li"
            ref={sortable.ref}
            style={sortable.style}
            selected={selected}
            className={cn('@max-[560px]/ws:shrink-0', sortable.dragging && 'shadow-cladd-popover')}
            contentClassName="flex items-center gap-1"
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
          className="focus-ring flex h-cladd-xl w-5 shrink-0 cursor-grab items-center justify-center rounded-cladd-md text-cladd-fg-softer hover:text-cladd-fg-soft @max-[1000px]/ws:w-4"
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          aria-current={selected}
          aria-label={`${screen.name}${live ? ', on air' : ''}`}
          title={screen.name}
          onClick={() => editScreen(screen.id)}
          className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-cladd-md py-1.5 pr-1 pl-1 text-left @max-[1000px]/ws:justify-center @max-[1000px]/ws:px-0"
        >
          <LayoutGlyph screen={screen} className="w-10 shrink-0" tone={live ? 'live' : 'default'} />
          <span className="min-w-0 flex-1 @max-[1000px]/ws:hidden">
            <span className="flex items-center gap-1">
              <span className="truncate text-cladd-xs font-semibold">{screen.name}</span>
              {screen.id === defaultId && (
                <Star
                  className="size-2.5 shrink-0 fill-cladd-fg-softer text-cladd-fg-softer"
                  aria-label="Default Screen"
                />
              )}
            </span>
            <span
              className={cn(
                'block text-cladd-xs',
                live ? 'font-semibold text-live' : 'text-cladd-fg-softer',
              )}
            >
              {live ? 'ON AIR' : `Key ${index + 1}`}
            </span>
          </span>
        </button>
      </ContextActionsTrigger>
      <ContextActionsContent className="min-w-52">
        <MenuItem onClick={() => void promptRenameScreen(screen.id)}>Rename…</MenuItem>
        <MenuItem onClick={() => duplicateScreen(screen.id)}>Duplicate</MenuItem>
        <MenuItem disabled={index === 0} onClick={() => nudgeScreen(screen.id, -1)}>
          Move Up
        </MenuItem>
        <MenuItem disabled={index === count - 1} onClick={() => nudgeScreen(screen.id, 1)}>
          Move Down
        </MenuItem>
        <MenuItem disabled={screen.id === defaultId} onClick={() => setDefaultScreen(screen.id)}>
          Make Default
        </MenuItem>
        <MenuSeparator />
        <MenuItem destructive disabled={live} onClick={() => deleteScreen(screen.id)}>
          Delete
        </MenuItem>
      </ContextActionsContent>
    </ContextActions>
  );
}

function NameField({ screen }: { screen: Screen }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Field label="Name" htmlFor="screen-name" error={error}>
      <Input
        inputId="screen-name"
        value={draft ?? screen.name}
        maxLength={40}
        valid={error === null}
        inputComponentProps={{ 'aria-label': 'Screen name' }}
        onChange={(next) => {
          setDraft(next);
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
      />
    </Field>
  );
}

function LayoutOption({ id, active, onPick }: { id: Template; active: boolean; onPick(): void }) {
  return (
    <Hint label={active ? 'Current layout' : `Use the ${TEMPLATE_LABELS[id]} layout`}>
      <Surface
        as="button"
        type="button"
        aria-pressed={active}
        aria-label={`${TEMPLATE_LABELS[id]} layout`}
        onClick={onPick}
        hoverable
        clickable
        outline={active}
        variant={active ? 'gradient' : 'solid'}
        color={active ? 'brand' : ''}
        className="focus-ring rounded-cladd-md text-cladd-xs font-medium"
        contentClassName="flex flex-col items-center gap-1 p-1.5"
      >
        <LayoutGlyph screen={PREVIEW_TEMPLATES[id]} className="w-full" />
        {TEMPLATE_LABELS[id]}
      </Surface>
    </Hint>
  );
}

function ScreenInspector({ screen }: { screen: Screen }) {
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
    { kind: 'primary', label: 'Primary', color: team?.colors.primary ?? '#111111' },
    { kind: 'secondary', label: 'Secondary', color: team?.colors.secondary ?? '#ffffff' },
  ];
  const kinds = Object.keys(CONTENT_META) as PanelContent['kind'][];
  return (
    <>
      <InspectorHeader
        media={
          <LayoutGlyph
            screen={screen}
            className="w-14"
            tone={screen.id === liveId ? 'live' : 'default'}
          />
        }
        title={screen.name}
        subtitle={`${screen.panels.length} panel${screen.panels.length === 1 ? '' : 's'}${screen.id === defaultId ? ' · Default' : ''}`}
      />
      <InspectorSection title="Screen">
        <NameField key={screen.id} screen={screen} />
      </InspectorSection>
      <InspectorSection title="Layout">
        {template === 'imported' && (
          <Banner tone="warn" variant="inline" className="items-start">
            Imported from an older show with {screen.panels.length} panels. It is kept exactly until
            you choose a template below, which resets it.
          </Banner>
        )}
        <div className="grid grid-cols-3 gap-1.5">
          {SCREEN_TEMPLATES.map((id) => (
            <LayoutOption
              key={id}
              id={id}
              active={id === template}
              onPick={() => {
                if (id !== template) applyTemplate(screen.id, id);
              }}
            />
          ))}
        </div>
      </InspectorSection>
      <InspectorSection
        title={`${panelPlace(screen, panelIndex)} panel`}
        detail={
          screen.panels.length > 1 ? `${panelIndex + 1} of ${screen.panels.length}` : undefined
        }
      >
        <Choice<PanelContent['kind']>
          label="Panel content"
          stretch
          value={panel.content.kind}
          onChange={(kind) => setPanelContent(screen.id, panel.id, kind)}
          options={kinds.map((kind) => ({
            value: kind,
            label: CONTENT_META[kind].label,
            hint:
              kind === 'media' && hasOtherMedia && panel.content.kind !== 'media'
                ? 'Moves the rotation here from the other panel'
                : CONTENT_META[kind].hint,
          }))}
        />
        {panel.content.kind === 'stats' &&
          (team ? (
            <PropertyRow label="Group">
              <Select
                aria-label="Stats group"
                options={team.groups.map((group) => group.id)}
                value={boardGroupFor(screen, team)?.id ?? ''}
                onChange={(value) => setPanelStatsGroup(screen.id, panel.id, value)}
                renderOption={({ value }) =>
                  team.groups.find((group) => group.id === value)?.name ?? value
                }
              >
                {boardGroupFor(screen, team)?.name ?? 'Choose a group'}
              </Select>
            </PropertyRow>
          ) : (
            <p className="text-cladd-xs text-warn">Stats needs a team. Add one in Roster.</p>
          ))}
        <p className="text-cladd-xs leading-snug text-cladd-fg-softer">
          {panel.content.kind === 'media'
            ? 'The media rotation plays here, and player cues appear here.'
            : panel.content.kind === 'stats' && team
              ? 'Substitutions in the Console change who appears.'
              : !screen.panels.some((item) => item.content.kind === 'media')
                ? 'No media panel: the rotation pauses on this Screen and cues cover the full display.'
                : CONTENT_META[panel.content.kind].hint}
        </p>
      </InspectorSection>
      <InspectorSection title="Background">
        <Choice<ShowBackground['kind']>
          label="Background"
          vertical
          value={screen.background.kind}
          onChange={(kind) => setScreenBackground(screen.id, kind)}
          options={backgrounds.map((item) => ({
            value: item.kind,
            ariaLabel: item.label,
            hint: `${item.label}${item.kind !== 'black' && !team ? ' (no team loaded)' : ''}`,
            label: (
              <span className="flex items-center gap-1.5">
                <span
                  className="size-3 rounded-cladd-3xs shadow-[0_0_0_1px_var(--color-cladd-outline)]"
                  style={{ background: item.color }}
                />
                {item.kind === 'black' ? 'Black' : `Team ${item.label.toLowerCase()}`}
              </span>
            ),
          }))}
        />
        <p className="text-cladd-xs text-cladd-fg-softer">
          Shows behind Blank panels and around letterboxed media.
        </p>
      </InspectorSection>
      <InspectorSection title="Actions">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => duplicateScreen(screen.id)}>
            <Copy />
            Duplicate
          </Button>
          <Button disabled={screen.id === defaultId} onClick={() => setDefaultScreen(screen.id)}>
            <Star />
            {screen.id === defaultId ? 'Default Screen' : 'Make Default'}
          </Button>
        </div>
      </InspectorSection>
      <InspectorSection title="Delete Screen">
        <Hint
          label={
            screen.id === liveId
              ? 'Switch to another Screen first'
              : 'Delete this Screen (Undo is offered)'
          }
        >
          <span className="flex">
            <ActionButton
              intent="danger"
              disabled={screen.id === liveId}
              onClick={() => deleteScreen(screen.id)}
            >
              <Trash2 />
              Delete
            </ActionButton>
          </span>
        </Hint>
      </InspectorSection>
    </>
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
    <>
      <WorkspaceToolbar>
        <span className="text-cladd-xs text-cladd-fg-soft">
          {display
            ? `Display ${display.index} · ${display.width}×${display.height}`
            : '16:9 preview'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Hint label="Show a title-safe margin inside each panel (preview only, never saved)">
            <ToggleButton selected={safe} onChange={toggleSafeArea} activeColor="warn">
              <Scan />
              Safe area
            </ToggleButton>
          </Hint>
          {isLiveOutput && !live && (
            <ToolbarButton variant="gradient" outline onClick={() => selectScreen(screen.id)}>
              <Radio className="text-live" />
              Switch Display to This Screen
            </ToolbarButton>
          )}
        </div>
      </WorkspaceToolbar>
      {live && (
        <Banner tone="live" icon={false}>
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-live" />
            This Screen is on air. Changes appear on the audience display immediately.
          </span>
        </Banner>
      )}
      <SurfaceCut
        outline={false}
        className="flex min-h-0 flex-1 rounded-none"
        contentClassName="flex min-h-0 flex-1 items-center justify-center p-6"
      >
        <div
          className={cn(
            'w-full rounded-cladd-3xs p-[3px] shadow-cladd-popover',
            live ? 'bg-live' : 'bg-cladd-outline',
          )}
          style={{ maxWidth: `min(100%, calc((100vh - 280px) * ${aspect}))` }}
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
      </SurfaceCut>
    </>
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
    <Workspace>
      <WorkspaceBody>
        <Panel
          as="aside"
          aria-label="Screens"
          className="w-56 shrink-0 border-r @max-[1000px]/ws:w-20 @max-[560px]/ws:w-full @max-[560px]/ws:border-r-0 @max-[560px]/ws:border-b"
          contentClassName="@max-[560px]/ws:flex-row @max-[560px]/ws:items-center"
        >
          <div className="flex h-cladd-xl shrink-0 items-center border-b pr-2 pl-3 @max-[1000px]/ws:justify-center @max-[1000px]/ws:px-1 @max-[560px]/ws:border-r @max-[560px]/ws:border-b-0">
            <SectionHeader
              label={<span className="@max-[1000px]/ws:hidden">Screens</span>}
              className="flex-1 @max-[1000px]/ws:flex-none"
              actions={
                <ActionMenu>
                  <ActionMenuTrigger
                    render={
                      <Button size="sm" aria-label="New Screen">
                        <Plus />
                        <span className="@max-[1000px]/ws:hidden">New</span>
                      </Button>
                    }
                  />
                  <ActionMenuContent align="end" className="min-w-56">
                    <MenuTitle>Start from a layout</MenuTitle>
                    {SCREEN_TEMPLATES.map((id) => (
                      <MenuItem
                        key={id}
                        icon={<LayoutGlyph screen={PREVIEW_TEMPLATES[id]} className="w-8" />}
                        onClick={() => createScreen(id)}
                      >
                        {TEMPLATE_LABELS[id]}
                      </MenuItem>
                    ))}
                  </ActionMenuContent>
                </ActionMenu>
              }
            />
          </div>
          <Scroll className="@max-[560px]/ws:min-w-0 @max-[560px]/ws:overflow-x-auto @max-[560px]/ws:overflow-y-hidden">
            <SortableArea ids={screens.map((item) => item.id)} onMove={moveScreen} layout="grid">
              <ol
                className="flex flex-col gap-0.5 p-1.5 @max-[560px]/ws:flex-row"
                aria-label="Screens in switcher order"
              >
                {screens.map((item, index) => (
                  <ScreenListItem
                    key={item.id}
                    screen={item}
                    index={index}
                    count={screens.length}
                  />
                ))}
              </ol>
            </SortableArea>
          </Scroll>
          <p className="border-t px-3 py-2 text-cladd-xs leading-snug text-cladd-fg-softer @max-[1000px]/ws:hidden">
            Order here is the switcher order and number keys.
          </p>
        </Panel>
        <WorkspaceMain>
          <Canvas screen={screen} />
        </WorkspaceMain>
        <Inspector label="Screen inspector">
          <ScreenInspector screen={screen} />
        </Inspector>
      </WorkspaceBody>
    </Workspace>
  );
}
