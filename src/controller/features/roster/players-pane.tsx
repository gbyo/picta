import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button, Checkbox, Input, ToggleButton } from '@cladd-ui/react';
import {
  Film,
  FolderSearch,
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
import { ActionButton, ColorField, CommitInput, IconButton } from '@/components/picta/controls';
import { Hint } from '@/components/picta/hint';
import { SortableArea, useSortableItem } from '@/components/picta/sortable';
import {
  Inspector,
  InspectorHeader,
  InspectorSection,
  PropertyRow,
  PropertyValue,
  Scroll,
  SelectableRow,
  WorkspaceMain,
} from '@/components/picta/workspace';
import { cn } from '@/lib/utils';
import { rt } from '@/runtime';
import { usePicta } from '@/state/store';
import { useDefinition, useTeam } from '@/hooks';
import {
  addRosterPlayer,
  addToGroup,
  choosePlayerMedia,
  editPlayer,
  locateMissingTeamMedia,
  moveRosterPlayer,
  nudgeRosterPlayer,
  removeFromGroup,
  removePlayer,
  resetFeaturedStats,
  selectPlayer,
  setPlayerMedia,
  setTeamColor,
  toggleFeaturedStat,
} from '@/actions/team';
import { presentSinglePlayer } from '@/actions/cues';

/** Roster columns. The card-statistics column gives way first when the workspace narrows. */
const ROSTER_GRID =
  'grid items-center gap-1 grid-cols-[1.5rem_3.5rem_minmax(6rem,1fr)_4.5rem_2.5rem_2.5rem_minmax(5rem,9rem)] @max-[860px]/ws:grid-cols-[1.5rem_3.5rem_minmax(6rem,1fr)_4.5rem_2.5rem_2.5rem]';

function Avatar({ player, className }: { player: Player; className?: string }) {
  const photo = player.media.photo;
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-cladd-sm bg-cladd-surface-cut',
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
        <UserRound className="size-1/2 text-cladd-fg-softer" />
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
    <SelectableRow
      ref={sortable.ref}
      style={sortable.style}
      role="row"
      aria-selected={selected}
      selected={selected}
      onFocusCapture={() => selectPlayer(player.id)}
      onClick={() => selectPlayer(player.id)}
      onKeyDown={onKeyDown}
      className={cn('mx-1', sortable.dragging && 'shadow-cladd-popover')}
      contentClassName="flex h-cladd-lg items-center px-1"
    >
      <div className={cn('w-full', ROSTER_GRID)}>
        <button
          type="button"
          ref={sortable.handleRef}
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={`Reorder ${player.name}`}
          className="focus-ring flex h-cladd-md cursor-grab items-center justify-center rounded-cladd-md text-cladd-fg-softer hover:text-cladd-fg-soft active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <CommitInput
          variant="inline"
          value={player.number}
          label={`Number for ${player.name}`}
          onCommit={(value) => editPlayer(player.id, { number: value })}
          inputClassName="text-right font-semibold tabular"
        />
        <CommitInput
          variant="inline"
          value={player.name}
          label={`Name for ${player.name}`}
          onCommit={(value) => editPlayer(player.id, { name: value })}
        />
        <CommitInput
          variant="inline"
          value={player.position ?? ''}
          label={`Position for ${player.name}`}
          list="sport-positions"
          placeholder="—"
          onCommit={(value) => editPlayer(player.id, { position: value })}
        />
        <Avatar player={player} className="size-6" />
        <span className="flex justify-center">
          {player.media.introVideo ? (
            player.media.introVideo.missing ? (
              <TriangleAlert className="size-4 text-danger" aria-label="Intro video missing" />
            ) : (
              <Film className="size-4 text-cladd-fg-soft" aria-label="Has intro video" />
            )
          ) : null}
        </span>
        <span
          className="truncate text-cladd-2xs text-cladd-fg-softer @max-[860px]/ws:hidden"
          title={groups.map((group) => group.name).join(', ')}
        >
          {featured.join(' · ')}
          {groups.length > 0 && <span> · {groups.length} grp</span>}
        </span>
      </div>
    </SelectableRow>
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
      className="mx-1 grid grid-cols-[1.5rem_3.5rem_minmax(6rem,1fr)_4.5rem_auto] items-center gap-1 px-1 py-2"
    >
      <Plus className="mx-auto size-4 text-cladd-fg-softer" />
      <Input
        inputRef={numberRef}
        value={number}
        onChange={setNumber}
        placeholder="#"
        maxLength={4}
        inputClassName="text-right tabular"
        inputComponentProps={{ 'aria-label': 'New player number' }}
      />
      <Input
        value={name}
        onChange={setName}
        placeholder="Player name"
        inputComponentProps={{ 'aria-label': 'New player name' }}
      />
      <Input
        value={position}
        onChange={setPosition}
        placeholder="Pos."
        inputComponentProps={{ 'aria-label': 'New player position', list: 'sport-positions' }}
      />
      <ActionButton type="submit" intent="primary" disabled={!name.trim()}>
        Add
      </ActionButton>
    </form>
  );
}

function MediaSlot({ player, kind }: { player: Player; kind: 'photo' | 'introVideo' }) {
  const ref = player.media[kind];
  const style = usePicta((state) => state.pathStyle);
  const label = kind === 'photo' ? 'Photo' : 'Intro video';
  return (
    <PropertyRow label={label} stacked>
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          ref?.missing ? 'text-danger' : ref ? '' : 'text-cladd-fg-softer',
        )}
        title={ref?.path}
      >
        {ref ? `${basename(ref.path, style)}${ref.missing ? ' (missing)' : ''}` : 'None'}
      </span>
      <Button size="sm" onClick={() => void choosePlayerMedia(player.id, kind)}>
        {ref ? 'Change…' : 'Choose…'}
      </Button>
      {ref && (
        <IconButton
          label={`Remove ${kind === 'photo' ? 'photo' : 'intro video'}`}
          size="sm"
          onClick={() => setPlayerMedia(player.id, kind, null)}
        >
          <X />
        </IconButton>
      )}
    </PropertyRow>
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
    <>
      <InspectorHeader
        media={<Avatar player={player} className="h-16 w-12" />}
        title={
          <span className="flex items-baseline gap-1.5">
            <span className="text-cladd-md font-bold tabular">
              {player.number ? `#${player.number}` : '—'}
            </span>
            <span className="truncate">{player.name}</span>
          </span>
        }
        subtitle={player.position ?? 'No position'}
      />
      <InspectorSection title="Presentation media">
        <MediaSlot player={player} kind="photo" />
        <MediaSlot player={player} kind="introVideo" />
        <p className="text-cladd-xs leading-snug text-cladd-fg-softer">
          Lineups play the intro video when there is one, and the player card otherwise.
        </p>
      </InspectorSection>
      <InspectorSection
        title="Card statistics"
        actions={
          !usingDefault && (
            <Button
              size="sm"
              variant="transparent"
              outline={false}
              onClick={() => resetFeaturedStats(player.id)}
            >
              Use default
            </Button>
          )
        }
      >
        <div className="flex flex-wrap gap-1">
          {definition.stats.map((stat) => (
            <Hint key={stat.id} label={stat.label}>
              <ToggleButton
                size="xs"
                selected={featured.includes(stat.id)}
                onChange={() => toggleFeaturedStat(player.id, stat.id)}
              >
                {stat.shortLabel}
              </ToggleButton>
            </Hint>
          ))}
        </div>
        <p className="text-cladd-xs text-cladd-fg-softer">
          Up to four, shown on the player card.{usingDefault ? ' Using the sport default.' : ''}
        </p>
      </InspectorSection>
      <InspectorSection title="Groups">
        {team.groups.map((group) => {
          const member = group.playerIds.includes(player.id);
          const full = group.maxPlayers !== undefined && group.playerIds.length >= group.maxPlayers;
          const disabled = !member && full;
          return (
            <label
              key={group.id}
              className={cn('flex h-cladd-md items-center gap-2', disabled && 'opacity-50')}
            >
              <Checkbox
                as="span"
                checked={member}
                disabled={disabled}
                onChange={(value) =>
                  value ? addToGroup(group.id, player.id) : removeFromGroup(group.id, player.id)
                }
              />
              <span className="min-w-0 truncate">{group.name}</span>
              <span className="text-cladd-fg-softer tabular">
                {group.playerIds.length}
                {group.maxPlayers !== undefined ? `/${group.maxPlayers}` : ''}
              </span>
            </label>
          );
        })}
      </InspectorSection>
      <InspectorSection title="Present">
        <div className="grid grid-cols-2 gap-2">
          <ActionButton
            intent="cue"
            disabled={!live}
            onClick={() => void presentSinglePlayer(player.id, 'card')}
          >
            <IdCard />
            Show Card
          </ActionButton>
          <ActionButton
            intent="cue"
            disabled={!live || !playerHasVideo(player)}
            onClick={() => void presentSinglePlayer(player.id, 'video')}
          >
            <Film />
            Play Intro
          </ActionButton>
        </div>
        {!live && (
          <p className="text-cladd-xs text-cladd-fg-softer">Go live to present this player.</p>
        )}
      </InspectorSection>
      <InspectorSection title="Remove">
        <ActionButton intent="danger" onClick={() => removePlayer(player.id)}>
          <Trash2 />
          Remove from Roster
        </ActionButton>
      </InspectorSection>
    </>
  );
}

/** A colour that previews while it is being picked and commits once, when the editor closes. */
function TeamColorField({ which, color }: { which: 'primary' | 'secondary'; color: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <ColorField
      label={which === 'primary' ? 'Primary team colour' : 'Secondary team colour'}
      value={draft ?? color}
      onChange={setDraft}
      onClose={() => {
        if (draft !== null && draft !== color) setTeamColor(which, draft);
        setDraft(null);
      }}
    />
  );
}

/** With no player selected the inspector is the team's own properties. */
function TeamInspector({ team, definition }: { team: Team; definition: SportDefinition }) {
  const missingMedia = team.players.filter(
    (player) => player.media.photo?.missing || player.media.introVideo?.missing,
  ).length;
  return (
    <>
      <InspectorHeader
        title={team.name}
        subtitle={`${definition.name} · ${team.players.length} player${team.players.length === 1 ? '' : 's'}`}
      />
      <InspectorSection title="Colours">
        <PropertyRow label="Primary">
          <TeamColorField which="primary" color={team.colors.primary} />
        </PropertyRow>
        <PropertyRow label="Secondary">
          <TeamColorField which="secondary" color={team.colors.secondary} />
        </PropertyRow>
        <p className="text-cladd-xs leading-snug text-cladd-fg-softer">
          Used for the scoreboard accent and Screen backgrounds.
        </p>
      </InspectorSection>
      <InspectorSection title="Media">
        <PropertyRow label="Missing files">
          <PropertyValue className={missingMedia > 0 ? 'text-danger' : 'text-ok'}>
            {missingMedia > 0 ? `${missingMedia} player${missingMedia === 1 ? '' : 's'}` : 'None'}
          </PropertyValue>
        </PropertyRow>
        {missingMedia > 0 && (
          <Button onClick={() => void locateMissingTeamMedia()}>
            <FolderSearch />
            Locate Photos & Videos…
          </Button>
        )}
      </InspectorSection>
      <p className="text-cladd-xs leading-relaxed text-cladd-fg-softer">
        Select a player to set their photo, intro video, card statistics and groups.
      </p>
    </>
  );
}

export function PlayersPane() {
  const team = useTeam();
  const definition = useDefinition();
  const selectedId = usePicta((state) => state.selectedPlayerId);
  if (!team || !definition) return null;
  const selected = team.players.find((player) => player.id === selectedId);
  return (
    <>
      <WorkspaceMain>
        <div
          role="row"
          className={cn(
            ROSTER_GRID,
            'mx-1 h-cladd-md shrink-0 border-b px-1 text-cladd-2xs font-medium tracking-wider text-cladd-fg-soft uppercase',
          )}
        >
          <span />
          <span className="pr-1.5 text-right">#</span>
          <span className="px-1.5">Name</span>
          <span className="px-1.5">Pos.</span>
          <span>Photo</span>
          <span>Intro</span>
          <span className="@max-[860px]/ws:hidden">Card stats</span>
        </div>
        <Scroll>
          <div role="rowgroup" aria-label="Roster" className="py-1">
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
            <p className="px-4 pb-4 text-cladd-xs text-cladd-fg-soft">
              Type a number and name, press Enter, repeat. Or use Paste Roster to bring in a whole
              list.
            </p>
          )}
        </Scroll>
        <datalist id="sport-positions">
          {definition.positions.map((position) => (
            <option key={position.id} value={position.shortLabel}>
              {position.label}
            </option>
          ))}
        </datalist>
      </WorkspaceMain>
      <Inspector label="Player">
        {selected ? (
          <PlayerInspector player={selected} team={team} definition={definition} />
        ) : (
          <TeamInspector team={team} definition={definition} />
        )}
      </Inspector>
    </>
  );
}
