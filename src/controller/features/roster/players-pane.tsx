import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  Film,
  GripVertical,
  IdCard,
  ImageOff,
  Plus,
  Trash2,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react';
import type { Player, Team } from '@core/domain.js';
import { basename } from '@core/paths.js';
import { featuredStatIds, type SportDefinition } from '@core/sports.js';
import { playerHasVideo } from '@core/player-cues.js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Hint } from '@/components/picta/hint';
import { SortableArea, useSortableItem } from '@/components/picta/sortable';
import { cn } from '@/lib/utils';
import { rt } from '@/runtime';
import { usePicta } from '@/state/store';
import { useDefinition, useTeam } from '@/hooks';
import {
  addRosterPlayer,
  addToGroup,
  choosePlayerMedia,
  editPlayer,
  moveRosterPlayer,
  nudgeRosterPlayer,
  removeFromGroup,
  removePlayer,
  resetFeaturedStats,
  selectPlayer,
  setPlayerMedia,
  toggleFeaturedStat,
} from '@/actions/team';
import { presentSinglePlayer } from '@/actions/cues';

const ROSTER_COLUMNS = '22px 56px minmax(120px, 1fr) 88px 44px 40px minmax(90px, 150px)';

/** A table cell that is an input, committed on blur or Enter. */
function Cell({
  value,
  label,
  onCommit,
  className,
  list,
  placeholder,
}: {
  value: string;
  label: string;
  onCommit(value: string): void;
  className?: string;
  list?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      aria-label={label}
      value={draft ?? value}
      placeholder={placeholder}
      list={list}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(null);
          requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
        }
      }}
      className={cn(
        'h-7 w-full min-w-0 rounded-[4px] border border-transparent bg-transparent px-1.5 text-[12.5px] text-fg outline-none placeholder:text-fg-faint hover:border-line focus:border-accent focus:bg-sunken',
        className,
      )}
    />
  );
}

function Avatar({ player, className }: { player: Player; className?: string }) {
  const photo = player.media.photo;
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-sunken',
        className,
      )}
    >
      {photo && !photo.missing ? (
        <img
          src={rt().platform.assetUrl(photo.path)}
          alt=""
          className="size-full object-cover"
          draggable={false}
        />
      ) : photo?.missing ? (
        <ImageOff className="size-1/2 text-danger" aria-label="Photo missing" />
      ) : (
        <UserRound className="size-1/2 text-fg-faint" />
      )}
    </span>
  );
}

function PlayerRow({
  player,
  team,
  definition,
  selected,
}: {
  player: Player;
  team: Team;
  definition: SportDefinition;
  selected: boolean;
}) {
  const sortable = useSortableItem(player.id);
  const groups = team.groups.filter((group) => group.playerIds.includes(player.id));
  const featured = featuredStatIds(player, definition)
    .map((id) => definition.stats.find((stat) => stat.id === id)?.shortLabel)
    .filter(Boolean);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      nudgeRosterPlayer(player.id, -1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      nudgeRosterPlayer(player.id, 1);
    }
  };
  return (
    <div
      ref={sortable.ref}
      style={{ ...sortable.style, gridTemplateColumns: ROSTER_COLUMNS }}
      role="row"
      aria-selected={selected}
      onFocusCapture={() => selectPlayer(player.id)}
      onClick={() => selectPlayer(player.id)}
      onKeyDown={onKeyDown}
      className={cn(
        'grid h-10 items-center gap-1 border-b border-line px-1.5',
        selected ? 'bg-accent-soft' : 'hover:bg-raised/60',
        sortable.dragging && 'bg-raised shadow-pop',
      )}
    >
      <button
        type="button"
        ref={sortable.handleRef}
        {...sortable.attributes}
        {...sortable.listeners}
        aria-label={`Reorder ${player.name}`}
        className="flex h-7 cursor-grab items-center justify-center rounded-[4px] text-fg-faint outline-none hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>
      <Cell
        value={player.number}
        label={`Number for ${player.name}`}
        onCommit={(value) => editPlayer(player.id, { number: value })}
        className="text-right font-semibold tabular"
      />
      <Cell
        value={player.name}
        label={`Name for ${player.name}`}
        onCommit={(value) => editPlayer(player.id, { name: value })}
      />
      <Cell
        value={player.position ?? ''}
        label={`Position for ${player.name}`}
        list="sport-positions"
        placeholder="—"
        onCommit={(value) => editPlayer(player.id, { position: value })}
      />
      <Avatar player={player} className="size-7" />
      <span className="flex justify-center">
        {player.media.introVideo ? (
          player.media.introVideo.missing ? (
            <TriangleAlert className="size-3.5 text-danger" aria-label="Intro video missing" />
          ) : (
            <Film className="size-3.5 text-fg-muted" aria-label="Has intro video" />
          )
        ) : null}
      </span>
      <span
        className="truncate text-[11px] text-fg-faint"
        title={groups.map((group) => group.name).join(', ')}
      >
        {featured.join(' · ')}
        {groups.length > 0 && <span className="text-fg-faint/70"> · {groups.length} grp</span>}
      </span>
    </div>
  );
}

function AddPlayerRow() {
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const numberRef = useRef<HTMLInputElement>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    addRosterPlayer(number, name, position);
    setNumber('');
    setName('');
    setPosition('');
    // Rapid entry: straight back to the number of the next player.
    numberRef.current?.focus();
  };
  return (
    <form
      onSubmit={submit}
      aria-label="Add a player"
      style={{ gridTemplateColumns: '22px 56px minmax(120px, 1fr) 88px auto' }}
      className="grid items-center gap-1 px-1.5 py-2"
    >
      <Plus className="mx-auto size-3.5 text-fg-faint" />
      <Input
        ref={numberRef}
        value={number}
        onChange={(event) => setNumber(event.currentTarget.value)}
        placeholder="#"
        aria-label="New player number"
        className="text-right tabular"
        maxLength={4}
      />
      <Input
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        placeholder="Player name"
        aria-label="New player name"
      />
      <Input
        value={position}
        onChange={(event) => setPosition(event.currentTarget.value)}
        placeholder="Pos."
        aria-label="New player position"
        list="sport-positions"
      />
      <Button type="submit" variant="primary" disabled={!name.trim()}>
        Add
      </Button>
    </form>
  );
}

function MediaSlot({ player, kind }: { player: Player; kind: 'photo' | 'introVideo' }) {
  const ref = player.media[kind];
  const style = usePicta((state) => state.pathStyle);
  return (
    <div className="flex items-center gap-2">
      <span className="w-[72px] shrink-0 text-[11.5px] whitespace-nowrap text-fg-faint">
        {kind === 'photo' ? 'Photo' : 'Intro video'}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[12px]',
          ref?.missing ? 'text-danger' : ref ? 'text-fg' : 'text-fg-faint',
        )}
        title={ref?.path}
      >
        {ref ? `${basename(ref.path, style)}${ref.missing ? ' (missing)' : ''}` : 'None'}
      </span>
      <Button size="sm" onClick={() => void choosePlayerMedia(player.id, kind)}>
        {ref ? 'Change…' : 'Choose…'}
      </Button>
      {ref && (
        <Hint label="Remove">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${kind === 'photo' ? 'photo' : 'intro video'}`}
            onClick={() => setPlayerMedia(player.id, kind, null)}
          >
            <X />
          </Button>
        </Hint>
      )}
    </div>
  );
}

function PlayerInspector({
  player,
  team,
  definition,
}: {
  player: Player;
  team: Team;
  definition: SportDefinition;
}) {
  const live = usePicta((state) => state.output.phase === 'live');
  const featured = featuredStatIds(player, definition);
  const usingDefault = player.featuredStats === undefined;
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <Avatar player={player} className="h-20 w-16" />
        <div className="min-w-0">
          <p className="text-[22px] leading-none font-bold text-fg tabular">
            {player.number ? `#${player.number}` : '—'}
          </p>
          <p className="truncate text-[14px] font-semibold text-fg">{player.name}</p>
          <p className="text-[12px] text-fg-faint">{player.position ?? 'No position'}</p>
        </div>
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="label-caps">Presentation media</h3>
        <MediaSlot player={player} kind="photo" />
        <MediaSlot player={player} kind="introVideo" />
        <p className="text-[11px] leading-snug text-fg-faint">
          Lineups play the intro video when there is one, and the player card otherwise.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="label-caps">Card statistics</h3>
          {!usingDefault && (
            <Button variant="link" size="sm" onClick={() => resetFeaturedStats(player.id)}>
              Use sport default
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {definition.stats.map((stat) => {
            const on = featured.includes(stat.id);
            return (
              <Hint key={stat.id} label={stat.label}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleFeaturedStat(player.id, stat.id)}
                  className={cn(
                    'h-6 rounded-[4px] border px-2 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    on
                      ? 'border-accent/60 bg-accent-soft text-fg'
                      : 'border-line text-fg-faint hover:text-fg-muted',
                  )}
                >
                  {stat.shortLabel}
                </button>
              </Hint>
            );
          })}
        </div>
        <p className="text-[11px] text-fg-faint">
          Up to four, shown on the player card.{usingDefault ? ' Using the sport default.' : ''}
        </p>
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className="label-caps">Groups</h3>
        {team.groups.map((group) => {
          const member = group.playerIds.includes(player.id);
          const full = group.maxPlayers !== undefined && group.playerIds.length >= group.maxPlayers;
          return (
            <label
              key={group.id}
              className={cn(
                'flex items-center gap-2 text-[12px] text-fg',
                !member && full && 'opacity-50',
              )}
            >
              <Checkbox
                checked={member}
                disabled={!member && full}
                onCheckedChange={(value) =>
                  value ? addToGroup(group.id, player.id) : removeFromGroup(group.id, player.id)
                }
              />
              {group.name}
              <span className="text-fg-faint tabular">
                {group.playerIds.length}
                {group.maxPlayers !== undefined ? `/${group.maxPlayers}` : ''}
              </span>
            </label>
          );
        })}
      </section>
      <section className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant="cue"
            disabled={!live}
            onClick={() => void presentSinglePlayer(player.id, 'card')}
          >
            <IdCard />
            Show Card
          </Button>
          <Button
            variant="cue"
            disabled={!live || !playerHasVideo(player)}
            onClick={() => void presentSinglePlayer(player.id, 'video')}
          >
            <Film />
            Play Intro
          </Button>
        </div>
        {!live && <p className="text-[11px] text-fg-faint">Go live to present this player.</p>}
        <Button
          variant="ghost"
          className="text-danger hover:text-danger"
          onClick={() => removePlayer(player.id)}
        >
          <Trash2 />
          Remove from Roster
        </Button>
      </section>
    </div>
  );
}

export function PlayersPane() {
  const team = useTeam();
  const definition = useDefinition();
  const selectedId = usePicta((state) => state.selectedPlayerId);
  if (!team || !definition) return null;
  const selected = team.players.find((player) => player.id === selectedId);
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          role="row"
          style={{ gridTemplateColumns: ROSTER_COLUMNS }}
          className="grid h-8 shrink-0 items-center gap-1 border-b border-line px-1.5 text-[10.5px] font-semibold tracking-[0.06em] text-fg-faint uppercase"
        >
          <span />
          <span className="pr-1.5 text-right">#</span>
          <span className="px-1.5">Name</span>
          <span className="px-1.5">Pos.</span>
          <span>Photo</span>
          <span>Intro</span>
          <span>Card stats</span>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div role="rowgroup" aria-label="Roster">
            <SortableArea ids={team.players.map((player) => player.id)} onMove={moveRosterPlayer}>
              {team.players.map((player) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  team={team}
                  definition={definition}
                  selected={player.id === selectedId}
                />
              ))}
            </SortableArea>
          </div>
          <AddPlayerRow />
          {team.players.length === 0 && (
            <p className="px-4 pb-4 text-[12px] text-fg-muted">
              Type a number and name, press Enter, repeat. Or use Paste Roster to bring in a whole
              list.
            </p>
          )}
        </ScrollArea>
        <datalist id="sport-positions">
          {definition.positions.map((position) => (
            <option key={position.id} value={position.shortLabel}>
              {position.label}
            </option>
          ))}
        </datalist>
      </div>
      <aside
        aria-label="Player"
        className="w-80 shrink-0 border-l border-line bg-surface max-[1150px]:w-64"
      >
        <ScrollArea className="h-full">
          {selected ? (
            <PlayerInspector player={selected} team={team} definition={definition} />
          ) : (
            <p className="px-6 py-10 text-center text-[12px] leading-relaxed text-fg-faint">
              Select a player to set their photo, intro video, card statistics and groups.
            </p>
          )}
        </ScrollArea>
      </aside>
    </div>
  );
}
