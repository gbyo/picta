import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  ChevronDown,
  Clapperboard,
  Clock,
  FilePlus2,
  Film,
  FolderOpen,
  FolderSearch,
  Image as ImageIcon,
  Lock,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  Zap,
  ArrowUpToLine,
  ArrowDownToLine,
  Link2Off,
} from 'lucide-react';
import type { MediaItem, MediaSet } from '@core/domain.js';
import { basename, dirname } from '@core/paths.js';
import { mediaDurationSeconds } from '@core/media.js';
import type { MediaPreflightFailure } from '@app/media-preflight.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Hint } from '@/components/picta/hint';
import { MediaThumb } from '@/components/picta/media-thumb';
import { EmptyState } from '@/components/picta/section';
import { SortableArea, useSortableItem } from '@/components/picta/sortable';
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

function DurationField({
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
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const seconds = Number(draft);
    if (Number.isFinite(seconds) && seconds >= 1) onCommit(seconds);
    setDraft(null);
  };
  return (
    <span className="relative inline-flex">
      <Input
        type="number"
        min={1}
        max={86400}
        aria-label={label}
        disabled={disabled ?? false}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(null);
        }}
        className="w-[72px] pr-7 tabular"
      />
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-fg-faint">
        sec
      </span>
    </span>
  );
}

function SetMenu({ set, locked }: { set: MediaSet; locked: boolean }) {
  const filePath = usePicta((state) => state.doc.mediaFilePath);
  const dirty = usePicta((state) => state.doc.mediaDirty);
  const style = usePicta((state) => state.pathStyle);
  const linked = usePicta((state) => state.doc.show.data.media.kind === 'file');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-8 max-w-72 gap-1.5 px-2 text-[13px] font-semibold text-fg"
          />
        }
      >
        <Clapperboard className="text-fg-muted" />
        <span className="truncate">{set.name}</span>
        {dirty && <span className="size-1.5 shrink-0 rounded-full bg-warn" aria-label="Unsaved" />}
        <span className="truncate text-[11.5px] font-normal text-fg-faint">
          {linked && filePath ? basename(filePath, style) : 'stored in show'}
        </span>
        <ChevronDown className="size-3 text-fg-faint" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="start">
        <DropdownMenuLabel>
          {linked
            ? 'This rotation is a reusable .pictaset file.'
            : 'This rotation is stored inside the show. Save it as a .pictaset to reuse it.'}
        </DropdownMenuLabel>
        <DropdownMenuItem disabled={locked} onClick={() => void newMediaSet()}>
          <FilePlus2 />
          New Empty Rotation
        </DropdownMenuItem>
        <DropdownMenuItem disabled={locked} onClick={() => void openMediaSet()}>
          <FolderOpen />
          Open Media Set…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void saveMedia()}>
          <Save />
          {linked ? 'Save Media Set' : 'Save as Media Set…'}
        </DropdownMenuItem>
        {linked && (
          <DropdownMenuItem onClick={() => void saveMedia(true)}>
            <Save />
            Save Media Set As…
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={!filePath} onClick={() => void reveal('media')}>
          <FolderSearch />
          Reveal Media Set File
        </DropdownMenuItem>
        {linked && (
          <DropdownMenuItem disabled={locked} onClick={embedMediaSet}>
            <Link2Off />
            Store in Show Instead
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={locked || set.items.length === 0}
          onClick={clearMedia}
        >
          <Trash2 />
          Remove All Items
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            ref={sortable.ref}
            style={sortable.style}
            {...sortable.attributes}
            {...sortable.listeners}
            aria-roledescription="Reorderable media item"
            aria-label={`${index + 1}. ${name}${status ? `, ${status}` : ''}`}
            aria-pressed={selected}
            data-media-id={item.id}
            onClick={(event) => onSelect(event.shiftKey || event.metaKey || event.ctrlKey)}
            onFocus={() => {
              if (!selected) onSelect(false);
            }}
            onKeyDownCapture={onKeyDown}
            className={cn(
              'group flex flex-col gap-1.5 rounded-lg border p-1.5 outline-none transition-[border-color,background-color,box-shadow]',
              selected
                ? 'border-accent bg-accent-soft'
                : 'border-line bg-raised hover:border-line-strong',
              'focus-visible:ring-2 focus-visible:ring-accent',
              sortable.dragging && 'shadow-pop',
              !locked && 'cursor-grab active:cursor-grabbing',
            )}
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
          <span className="absolute top-1 left-1 rounded-[3px] bg-black/70 px-1 text-[11px] font-semibold text-white tabular">
            {index + 1}
          </span>
          <span
            className={cn(
              'absolute right-1 bottom-1 flex items-center gap-0.5 rounded-[3px] bg-black/70 px-1 text-[11px] tabular',
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
          <p className="truncate text-[12px] font-medium text-fg" title={item.path}>
            {name}
          </p>
          <p className={cn('truncate text-[11px]', status ? 'text-danger' : 'text-fg-faint')}>
            {status ??
              (item.type === 'video'
                ? 'Plays to the end'
                : custom
                  ? 'Custom time'
                  : 'Default time')}
          </p>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem
          disabled={!live || item.missing === true}
          onClick={() => void showMediaNow(item)}
        >
          <Zap />
          Show Now
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={locked || index === 0} onClick={() => moveMedia(index, 0)}>
          <ArrowUpToLine />
          Move to Start
        </ContextMenuItem>
        <ContextMenuItem
          disabled={locked || index === set.items.length - 1}
          onClick={() => moveMedia(index, set.items.length - 1)}
        >
          <ArrowDownToLine />
          Move to End
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => void revealPath(item.path)}
          disabled={item.missing === true}
        >
          <FolderSearch />
          Reveal in File Manager
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          disabled={locked}
          onClick={() => removeMedia([item.id])}
        >
          <Trash2 />
          Remove from Rotation
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function Inspector({
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
  const style = usePicta((state) => state.pathStyle);
  if (items.length === 0)
    return (
      <div className="flex h-full flex-col justify-center px-5 text-center text-[12px] leading-relaxed text-fg-faint">
        Select an item to see its details and timing. Drag to reorder, or use Alt+arrow keys.
      </div>
    );
  if (items.length > 1)
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[13px] font-semibold text-fg">{items.length} items selected</p>
        <Button
          variant="danger"
          disabled={locked}
          onClick={() => removeMedia(items.map((item) => item.id))}
        >
          <Trash2 />
          Remove {items.length} Items
        </Button>
      </div>
    );
  const item = items[0]!;
  const failure = failures.get(item.id);
  const index = set.items.findIndex((candidate) => candidate.id === item.id);
  return (
    <div className="flex flex-col gap-4 p-4">
      <MediaThumb
        item={item}
        sizing={set.imageSizing}
        className="w-full"
        failed={Boolean(failure)}
      />
      <div className="min-w-0">
        <p
          className="truncate text-[13px] font-semibold text-fg"
          title={basename(item.path, style)}
        >
          {basename(item.path, style)}
        </p>
        <p className="truncate text-[11px] text-fg-faint" title={item.path}>
          {dirname(item.path, style)}
        </p>
      </div>
      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-[12px]">
        <dt className="text-fg-faint">Position</dt>
        <dd className="text-fg tabular">
          {index + 1} of {set.items.length}
        </dd>
        <dt className="text-fg-faint">Type</dt>
        <dd className="flex items-center gap-1.5 text-fg">
          {item.type === 'video' ? (
            <Film className="size-3.5" />
          ) : (
            <ImageIcon className="size-3.5" />
          )}
          {item.type === 'video' ? 'Video' : 'Image'}
        </dd>
        <dt className="text-fg-faint">Status</dt>
        <dd className={cn(item.missing || failure ? 'text-danger' : 'text-ok')}>
          {item.missing ? 'File is missing' : failure ? failure.message : 'Ready'}
        </dd>
      </dl>
      {item.type === 'image' ? (
        <div className="flex flex-col gap-2">
          <p className="label-caps">On screen for</p>
          <ToggleGroup
            value={[item.durationSeconds === undefined ? 'default' : 'custom']}
            onValueChange={(value) => {
              const next = value[0];
              if (next === 'default') setItemDuration(item.id, null);
              if (next === 'custom') setItemDuration(item.id, mediaDurationSeconds(item, set));
            }}
            disabled={locked}
          >
            <ToggleGroupItem value="default">Default · {set.imageDurationSeconds}s</ToggleGroupItem>
            <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
          </ToggleGroup>
          {item.durationSeconds !== undefined && (
            <DurationField
              label="Custom time on screen"
              value={item.durationSeconds}
              disabled={locked}
              onCommit={(seconds) => setItemDuration(item.id, seconds)}
            />
          )}
        </div>
      ) : (
        <p className="text-[12px] text-fg-muted">
          Videos play once to the end, then the rotation continues.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Hint label="Show once as a cue, then return to the rotation">
          <Button
            variant="cue"
            disabled={!live || item.missing === true}
            onClick={() => void showMediaNow(item)}
          >
            <Zap />
            Show Now
          </Button>
        </Hint>
        <Button
          variant="ghost"
          disabled={locked}
          onClick={() => removeMedia([item.id])}
          className="text-danger hover:text-danger"
        >
          <Trash2 />
          Remove from Rotation
        </Button>
      </div>
    </div>
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 py-2">
        <SetMenu set={set} locked={locked} />
        <span className="text-[11.5px] text-fg-faint tabular">
          {set.items.length} item{set.items.length === 1 ? '' : 's'}
          {missing > 0 && <span className="text-danger"> · {missing} missing</span>}
          {failures.size > 0 && <span className="text-danger"> · {failures.size} can't play</span>}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
            Images
            <DurationField
              label="Default time on screen for images"
              value={set.imageDurationSeconds}
              disabled={locked}
              onCommit={(seconds) => setMediaDefaults({ imageDurationSeconds: seconds })}
            />
          </label>
          <ToggleGroup
            aria-label="Transition"
            value={[set.transition]}
            disabled={locked}
            onValueChange={(value) => {
              const next = value[0];
              if (next === 'none' || next === 'crossfade') setMediaDefaults({ transition: next });
            }}
          >
            <ToggleGroupItem value="crossfade">Crossfade</ToggleGroupItem>
            <ToggleGroupItem value="none">Cut</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            aria-label="Image sizing"
            value={[set.imageSizing]}
            disabled={locked}
            onValueChange={(value) => {
              const next = value[0];
              if (next === 'fit' || next === 'fill') setMediaDefaults({ imageSizing: next });
            }}
          >
            <Hint label="Show the whole image; letterbox if needed">
              <ToggleGroupItem value="fit">Fit</ToggleGroupItem>
            </Hint>
            <Hint label="Fill the panel; crop the edges if needed">
              <ToggleGroupItem value="fill">Fill</ToggleGroupItem>
            </Hint>
          </ToggleGroup>
          <Button variant="primary" disabled={locked} onClick={() => void chooseAndAddMedia()}>
            <Plus />
            Add Media
          </Button>
        </div>
      </div>
      {locked && (
        <div className="flex items-center gap-2 border-b border-line bg-live-soft px-3 py-1.5 text-[12px] text-fg">
          <Lock className="size-3.5 text-live" />
          The rotation is locked while ON AIR, because the display is playing it. Show Now still
          works.
        </div>
      )}
      {missing > 0 && (
        <div className="flex items-center gap-2 border-b border-line bg-danger-soft px-3 py-1.5 text-[12px] text-fg">
          <TriangleAlert className="size-3.5 text-danger" />
          {missing} file{missing === 1 ? ' was' : 's were'} moved or deleted. They are skipped until
          found.
          <Button
            size="sm"
            className="ml-auto"
            disabled={locked}
            onClick={() => void locateMissingMedia()}
          >
            <FolderSearch />
            Locate…
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <ScrollArea className="min-h-0 min-w-0 flex-1">
          {set.items.length === 0 ? (
            <EmptyState
              className="h-full min-h-80"
              icon={<Clapperboard />}
              title="Build the media rotation"
              actions={
                <Button
                  variant="primary"
                  disabled={locked}
                  onClick={() => void chooseAndAddMedia()}
                >
                  <Plus />
                  Add Media…
                </Button>
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
        </ScrollArea>
        <aside
          aria-label="Media inspector"
          className="w-72 shrink-0 border-l border-line bg-surface max-[1100px]:w-60"
        >
          <ScrollArea className="h-full">
            <Inspector set={set} items={selected} failures={failures} locked={locked} live={live} />
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}
