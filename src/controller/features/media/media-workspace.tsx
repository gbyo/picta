import { useMemo, type KeyboardEvent } from 'react';
import { Button, NumberField, Surface } from '@cladd-ui/react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Clapperboard,
  Clock,
  FilePlus2,
  Film,
  FolderOpen,
  FolderSearch,
  Image as ImageIcon,
  Link2Off,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
  Zap,
} from 'lucide-react';
import type { MediaItem, MediaSet } from '@core/domain.js';
import { basename, dirname } from '@core/paths.js';
import { mediaDurationSeconds } from '@core/media.js';
import type { MediaPreflightFailure } from '@app/media-preflight.js';
import { ActionButton, Choice } from '@/components/picta/controls';
import { Banner, EmptyState } from '@/components/picta/feedback';
import {
  ContextActions,
  ContextActionsContent,
  ContextActionsTrigger,
  MenuItem,
  MenuSeparator,
  OverflowMenu,
} from '@/components/picta/menu';
import { MediaThumb } from '@/components/picta/media-thumb';
import { ResourceMenu, type ResourceAction } from '@/components/picta/resource-menu';
import { SortableArea, useSortableItem } from '@/components/picta/sortable';
import {
  Inspector,
  InspectorHeader,
  InspectorSection,
  PropertyRow,
  PropertyValue,
  Scroll,
  Workspace,
  WorkspaceBody,
  WorkspaceHeader,
  WorkspaceMain,
} from '@/components/picta/workspace';
import { Hint } from '@/components/picta/hint';
import { cn } from '@/lib/utils';
import { usePicta, getState } from '@/state/store';
import { useMediaSet } from '@/hooks';
import {
  chooseAndAddMedia,
  clearMedia,
  locateMissingMedia,
  moveMedia,
  moveMediaById,
  nudgeMedia,
  removeMedia,
  selectMedia,
  setItemDuration,
  setMediaDefaults,
  showMediaNow,
} from '@/actions/media';
import {
  embedMediaSet,
  newMediaSet,
  openMediaSet,
  reveal,
  revealPath,
  saveMedia,
} from '@/actions/document';

/** Whole seconds on screen, committed on blur or Enter. */
function SecondsField({
  value,
  onCommit,
  disabled,
  label,
}: {
  value: number;
  onCommit(seconds: number): void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <NumberField
      role="group"
      aria-label={label}
      min={1}
      max={86400}
      value={value}
      disabled={disabled ?? false}
      onChange={onCommit}
      className="w-full max-w-36"
    />
  );
}

function RotationMenu({ set, locked }: { set: MediaSet; locked: boolean }) {
  const filePath = usePicta((state) => state.doc.mediaFilePath);
  const dirty = usePicta((state) => state.doc.mediaDirty);
  const style = usePicta((state) => state.pathStyle);
  const linked = usePicta((state) => state.doc.show.data.media.kind === 'file');
  const groups: ResourceAction[][] = [
    [
      {
        id: 'new',
        label: 'New Empty Rotation',
        icon: FilePlus2,
        disabled: locked,
        onSelect: () => void newMediaSet(),
      },
      {
        id: 'open',
        label: 'Open Media Set…',
        icon: FolderOpen,
        disabled: locked,
        onSelect: () => void openMediaSet(),
      },
    ],
    [
      {
        id: 'save',
        label: linked ? 'Save Media Set' : 'Save as Media Set…',
        icon: Save,
        onSelect: () => void saveMedia(),
      },
      ...(linked
        ? [
            {
              id: 'save-as',
              label: 'Save Media Set As…',
              icon: Save,
              onSelect: () => void saveMedia(true),
            },
          ]
        : []),
      {
        id: 'reveal',
        label: 'Reveal Media Set File',
        icon: FolderSearch,
        disabled: !filePath,
        onSelect: () => void reveal('media'),
      },
      ...(linked
        ? [
            {
              id: 'embed',
              label: 'Store in Show Instead',
              icon: Link2Off,
              disabled: locked,
              onSelect: embedMediaSet,
            },
          ]
        : []),
    ],
  ];
  return (
    <ResourceMenu
      icon={Clapperboard}
      name={set.name}
      dirty={dirty}
      where={linked && filePath ? basename(filePath, style) : 'stored in show'}
      groups={groups}
    />
  );
}

function MediaCard({
  item,
  index,
  set,
  selected,
  failure,
  locked,
  live,
  onSelect,
}: {
  item: MediaItem;
  index: number;
  set: MediaSet;
  selected: boolean;
  failure: MediaPreflightFailure | undefined;
  locked: boolean;
  live: boolean;
  onSelect(extend: boolean): void;
}) {
  const sortable = useSortableItem(item.id, locked);
  const style = usePicta((state) => state.pathStyle);
  const name = basename(item.path, style);
  const custom = item.type === 'image' && item.durationSeconds !== undefined;
  const status = item.missing ? 'Missing' : failure ? "Can't play" : null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowUp')) {
      event.preventDefault();
      event.stopPropagation();
      nudgeMedia(item.id, -1);
    } else if (event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowDown')) {
      event.preventDefault();
      event.stopPropagation();
      nudgeMedia(item.id, 1);
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && !locked) {
      event.preventDefault();
      removeMedia(
        getState().selectedMediaIds.includes(item.id) ? getState().selectedMediaIds : [item.id],
      );
    }
  };

  return (
    <ContextActions>
      <ContextActionsTrigger
        render={
          <Surface
            ref={sortable.ref}
            style={sortable.style}
            {...sortable.attributes}
            {...sortable.listeners}
            aria-roledescription="Reorderable media item"
            aria-label={`${index + 1}. ${name}${status ? `, ${status}` : ''}`}
            aria-pressed={selected}
            data-media-id={item.id}
            onClick={(event: React.MouseEvent) =>
              onSelect(event.shiftKey || event.metaKey || event.ctrlKey)
            }
            onFocus={() => {
              if (!selected) onSelect(false);
            }}
            onKeyDownCapture={onKeyDown}
            variant={selected ? 'gradient' : 'solid'}
            color={selected ? 'brand' : ''}
            outline={selected}
            hoverable
            overlayPosition="below"
            className={cn(
              'focus-ring group rounded-cladd-lg',
              sortable.dragging && 'shadow-cladd-popover',
              !locked && 'cursor-grab active:cursor-grabbing',
            )}
            contentClassName="flex flex-col gap-1.5 p-1.5"
          />
        }
      >
        <div className="relative">
          <MediaThumb
            item={item}
            sizing={set.imageSizing}
            className="w-full"
            failed={Boolean(failure)}
            typeIcon={false}
          />
          <span className="absolute top-1 left-1 rounded-cladd-3xs bg-black/70 px-1 text-cladd-2xs font-semibold text-white tabular">
            {index + 1}
          </span>
          <span
            className={cn(
              'absolute right-1 bottom-1 flex items-center gap-0.5 rounded-cladd-3xs bg-black/70 px-1 text-cladd-2xs tabular',
              custom ? 'text-white' : 'text-white/60',
            )}
          >
            {item.type === 'video' ? (
              <>
                <Film className="size-2.5" />
                video
              </>
            ) : (
              <>
                <Clock className="size-2.5" />
                {mediaDurationSeconds(item, set)}s
              </>
            )}
          </span>
        </div>
        <div className="min-w-0 px-0.5">
          <p className="truncate text-cladd-xs font-semibold" title={item.path}>
            {name}
          </p>
          <p
            className={cn(
              'truncate text-cladd-2xs',
              status ? 'text-danger' : 'text-cladd-fg-softer',
            )}
          >
            {status ??
              (item.type === 'video'
                ? 'Plays to the end'
                : custom
                  ? 'Custom time'
                  : 'Default time')}
          </p>
        </div>
      </ContextActionsTrigger>
      <ContextActionsContent className="min-w-56">
        <MenuItem
          icon={<Zap />}
          disabled={!live || item.missing === true}
          onClick={() => void showMediaNow(item)}
        >
          Show Now
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon={<ArrowUpToLine />}
          disabled={locked || index === 0}
          onClick={() => moveMedia(index, 0)}
        >
          Move to Start
        </MenuItem>
        <MenuItem
          icon={<ArrowDownToLine />}
          disabled={locked || index === set.items.length - 1}
          onClick={() => moveMedia(index, set.items.length - 1)}
        >
          Move to End
        </MenuItem>
        <MenuItem
          icon={<FolderSearch />}
          onClick={() => void revealPath(item.path)}
          disabled={item.missing === true}
        >
          Reveal in File Manager
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          destructive
          icon={<Trash2 />}
          disabled={locked}
          onClick={() => removeMedia([item.id])}
        >
          Remove from Rotation
        </MenuItem>
      </ContextActionsContent>
    </ContextActions>
  );
}

/** With nothing selected the inspector is the rotation's own properties. */
function RotationInspector({ set, locked }: { set: MediaSet; locked: boolean }) {
  return (
    <>
      <InspectorHeader
        title="Rotation"
        subtitle={`${set.items.length} item${set.items.length === 1 ? '' : 's'} · defaults for every item`}
      />
      <InspectorSection title="Timing">
        <PropertyRow label="Time per image (seconds)" stacked>
          <SecondsField
            label="Default time on screen for images"
            value={set.imageDurationSeconds}
            disabled={locked}
            onCommit={(seconds) => setMediaDefaults({ imageDurationSeconds: seconds })}
          />
        </PropertyRow>
      </InspectorSection>
      <InspectorSection title="Display">
        <PropertyRow label="Transition" stacked>
          <Choice
            label="Transition"
            stretch
            disabled={locked}
            value={set.transition}
            onChange={(transition) => setMediaDefaults({ transition })}
            options={[
              { value: 'crossfade', label: 'Crossfade' },
              { value: 'none', label: 'Cut' },
            ]}
          />
        </PropertyRow>
        <PropertyRow label="Image sizing" stacked>
          <Choice
            label="Image sizing"
            stretch
            disabled={locked}
            value={set.imageSizing}
            onChange={(imageSizing) => setMediaDefaults({ imageSizing })}
            options={[
              { value: 'fit', label: 'Fit', hint: 'Show the whole image; letterbox if needed' },
              { value: 'fill', label: 'Fill', hint: 'Fill the panel; crop the edges if needed' },
            ]}
          />
        </PropertyRow>
      </InspectorSection>
      <p className="text-cladd-xs leading-relaxed text-cladd-fg-softer">
        Select an item to see its details and timing. Drag to reorder, or use Alt+arrow keys.
      </p>
    </>
  );
}

function ItemInspector({
  set,
  item,
  failure,
  locked,
  live,
}: {
  set: MediaSet;
  item: MediaItem;
  failure: MediaPreflightFailure | undefined;
  locked: boolean;
  live: boolean;
}) {
  const style = usePicta((state) => state.pathStyle);
  const index = set.items.findIndex((candidate) => candidate.id === item.id);
  return (
    <>
      <MediaThumb
        item={item}
        sizing={set.imageSizing}
        className="w-full"
        failed={Boolean(failure)}
      />
      <InspectorHeader
        title={<span title={basename(item.path, style)}>{basename(item.path, style)}</span>}
        subtitle={<span title={item.path}>{dirname(item.path, style)}</span>}
      />
      <InspectorSection title="Details">
        <PropertyRow label="Position">
          <PropertyValue>
            {index + 1} of {set.items.length}
          </PropertyValue>
        </PropertyRow>
        <PropertyRow label="Type">
          <PropertyValue className="flex items-center gap-1.5">
            {item.type === 'video' ? <Film className="size-4" /> : <ImageIcon className="size-4" />}
            {item.type === 'video' ? 'Video' : 'Image'}
          </PropertyValue>
        </PropertyRow>
        <PropertyRow label="Status">
          <PropertyValue className={cn(item.missing || failure ? 'text-danger' : 'text-ok')}>
            {item.missing ? 'File is missing' : failure ? failure.message : 'Ready'}
          </PropertyValue>
        </PropertyRow>
      </InspectorSection>
      <InspectorSection title="On screen for">
        {item.type === 'image' ? (
          <>
            <Choice<'default' | 'custom'>
              label="On screen for"
              stretch
              disabled={locked}
              value={item.durationSeconds === undefined ? 'default' : 'custom'}
              onChange={(next) =>
                setItemDuration(
                  item.id,
                  next === 'default' ? null : mediaDurationSeconds(item, set),
                )
              }
              options={[
                { value: 'default', label: `Default · ${set.imageDurationSeconds}s` },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            {item.durationSeconds !== undefined && (
              <PropertyRow label="Time on screen (seconds)" stacked>
                <SecondsField
                  label="Custom time on screen"
                  value={item.durationSeconds}
                  disabled={locked}
                  onCommit={(seconds) => setItemDuration(item.id, seconds)}
                />
              </PropertyRow>
            )}
          </>
        ) : (
          <p className="text-cladd-xs text-cladd-fg-soft">
            Videos play once to the end, then the rotation continues.
          </p>
        )}
      </InspectorSection>
      <InspectorSection title="Actions">
        <Hint label="Show once as a cue, then return to the rotation">
          <span className="flex">
            <ActionButton
              intent="cue"
              className="w-full"
              disabled={!live || item.missing === true}
              onClick={() => void showMediaNow(item)}
            >
              <Zap />
              Show Now
            </ActionButton>
          </span>
        </Hint>
      </InspectorSection>
      <InspectorSection title="Remove">
        <ActionButton
          intent="danger"
          className="w-full"
          disabled={locked}
          onClick={() => removeMedia([item.id])}
        >
          <Trash2 />
          Remove from Rotation
        </ActionButton>
      </InspectorSection>
    </>
  );
}

function MediaInspector({
  set,
  items,
  failures,
  locked,
  live,
}: {
  set: MediaSet;
  items: MediaItem[];
  failures: Map<string, MediaPreflightFailure>;
  locked: boolean;
  live: boolean;
}) {
  if (items.length === 0) return <RotationInspector set={set} locked={locked} />;
  if (items.length > 1)
    return (
      <>
        <InspectorHeader title={`${items.length} items selected`} />
        <InspectorSection title="Remove">
          <ActionButton
            intent="danger"
            disabled={locked}
            onClick={() => removeMedia(items.map((item) => item.id))}
          >
            <Trash2 />
            Remove {items.length} Items
          </ActionButton>
        </InspectorSection>
      </>
    );
  const item = items[0]!;
  return (
    <ItemInspector
      set={set}
      item={item}
      failure={failures.get(item.id)}
      locked={locked}
      live={live}
    />
  );
}

/** Build the rotation: what plays, in what order, for how long. */
export function MediaWorkspace() {
  const set = useMediaSet();
  const phase = usePicta((state) => state.output.phase);
  const selectedIds = usePicta((state) => state.selectedMediaIds);
  const preflight = usePicta((state) => state.preflight.result);
  const locked = phase !== 'off';
  const live = phase === 'live';
  const failures = useMemo(
    () => new Map((preflight?.failed ?? []).map((failure) => [failure.id, failure])),
    [preflight],
  );
  const missing = set.items.filter((item) => item.missing).length;
  const selected = set.items.filter((item) => selectedIds.includes(item.id));
  const ids = useMemo(() => set.items.map((item) => item.id), [set.items]);

  const select = (id: string, extend: boolean) => {
    if (!extend) return selectMedia([id]);
    selectMedia(
      selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id],
    );
  };

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
    )
      return;
    const current = document.activeElement?.closest<HTMLElement>('[data-media-id]');
    if (!current) return;
    const index = ids.indexOf(current.dataset['mediaId'] ?? '');
    const grid = current.parentElement;
    const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 1;
    const delta =
      event.key === 'ArrowLeft'
        ? -1
        : event.key === 'ArrowRight'
          ? 1
          : event.key === 'ArrowUp'
            ? -columns
            : event.key === 'ArrowDown'
              ? columns
              : 0;
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : index + delta;
    const id = ids[Math.max(0, Math.min(ids.length - 1, target))];
    if (!id) return;
    event.preventDefault();
    document.querySelector<HTMLElement>(`[data-media-id="${id}"]`)?.focus();
  };

  const failing = failures.size;
  return (
    <Workspace>
      <WorkspaceHeader
        title={<RotationMenu set={set} locked={locked} />}
        meta={
          <span className="tabular">
            {set.items.length} item{set.items.length === 1 ? '' : 's'}
            {missing > 0 && <span className="text-danger"> · {missing} missing</span>}
            {failing > 0 && <span className="text-danger"> · {failing} can't play</span>}
          </span>
        }
        actions={
          <ActionButton intent="primary" disabled={locked} onClick={() => void chooseAndAddMedia()}>
            <Plus />
            Add Media
          </ActionButton>
        }
        menu={
          <OverflowMenu label="Rotation options">
            <MenuItem icon={<SlidersHorizontal />} onClick={() => selectMedia([])}>
              Rotation Settings
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              destructive
              icon={<Trash2 />}
              disabled={locked || set.items.length === 0}
              onClick={clearMedia}
            >
              Remove All Items
            </MenuItem>
          </OverflowMenu>
        }
      />
      {locked && (
        <Banner tone="live">
          The rotation is locked while ON AIR, because the display is playing it. Show Now still
          works.
        </Banner>
      )}
      {missing > 0 && (
        <Banner
          tone="danger"
          actions={
            <Button disabled={locked} onClick={() => void locateMissingMedia()}>
              <FolderSearch />
              Locate…
            </Button>
          }
        >
          {missing} file{missing === 1 ? ' was' : 's were'} moved or deleted. They are skipped until
          found.
        </Banner>
      )}
      <WorkspaceBody>
        <WorkspaceMain>
          <Scroll
            onClick={(event) => {
              // A click on the empty canvas shows the rotation's own settings.
              if (event.target === event.currentTarget) selectMedia([]);
            }}
          >
            {set.items.length === 0 ? (
              <EmptyState
                className="h-full min-h-80"
                icon={<Clapperboard />}
                title="Build the media rotation"
                actions={
                  <ActionButton
                    intent="primary"
                    disabled={locked}
                    onClick={() => void chooseAndAddMedia()}
                  >
                    <Plus />
                    Add Media…
                  </ActionButton>
                }
              >
                Drop PNG, JPEG, WebP, MP4 or WebM files anywhere on this window, or add them from
                disk. Files stay where they are; Picta never copies them.
              </EmptyState>
            ) : (
              <SortableArea ids={ids} onMove={moveMediaById} layout="grid" disabled={locked}>
                <div
                  role="list"
                  aria-label="Media rotation"
                  data-owns-arrows
                  onKeyDown={onGridKey}
                  className="grid gap-2.5 p-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}
                >
                  {set.items.map((item, index) => (
                    <MediaCard
                      key={item.id}
                      item={item}
                      index={index}
                      set={set}
                      selected={selectedIds.includes(item.id)}
                      failure={failures.get(item.id)}
                      locked={locked}
                      live={live}
                      onSelect={(extend) => select(item.id, extend)}
                    />
                  ))}
                </div>
              </SortableArea>
            )}
          </Scroll>
        </WorkspaceMain>
        <Inspector label="Media inspector">
          <MediaInspector
            set={set}
            items={selected}
            failures={failures}
            locked={locked}
            live={live}
          />
        </Inspector>
      </WorkspaceBody>
    </Workspace>
  );
}
