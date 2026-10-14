import { Button, List, ListButton, Select } from '@cladd-ui/react';
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { PlayerGroup, Team } from '@core/domain.js';
import { ActionButton, CommitInput, IconButton } from '@/components/picta/controls';
import { Banner, EmptyState } from '@/components/picta/feedback';
import { SortableArea, useSortableItem } from '@/components/picta/sortable';
import {
  Inspector,
  InspectorHeader,
  InspectorSection,
  Panel,
  PropertyRow,
  Scroll,
  WorkspaceMain,
} from '@/components/picta/workspace';
import { cn } from '@/lib/utils';
import { usePicta } from '@/state/store';
import { useTeam } from '@/hooks';
import { useWidth } from '@/use-width';
import {
  addToGroup,
  createGroup,
  deleteGroup,
  moveInGroup,
  nudgeInGroup,
  removeFromGroup,
  renameGroup,
  selectGroup,
  setGroupMax,
} from '@/actions/team';
import { playerLabel } from '@/actions/cues';

function MemberRow({
  group,
  team,
  playerId,
  index,
}: {
  group: PlayerGroup;
  team: Team;
  playerId: string;
  index: number;
}) {
  const sortable = useSortableItem(playerId);
  const player = team.players.find((item) => item.id === playerId);
  if (!player) return null;
  return (
    <li
      ref={sortable.ref}
      style={sortable.style}
      className={cn(
        'flex h-cladd-lg items-center gap-2 border-b px-2',
        sortable.dragging
          ? 'bg-cladd-surface shadow-cladd-popover'
          : 'hover:bg-cladd-surface-hover',
      )}
    >
      <button
        type="button"
        ref={sortable.handleRef}
        {...sortable.attributes}
        {...sortable.listeners}
        aria-label={`Reorder ${player.name}`}
        className="focus-ring flex h-cladd-md w-5 cursor-grab items-center justify-center rounded-cladd-md text-cladd-fg-softer hover:text-cladd-fg-soft"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-5 text-right text-cladd-xs text-cladd-fg-softer tabular">{index + 1}</span>
      <span className="w-8 text-cladd-xs font-semibold tabular">{player.number}</span>
      <span className="min-w-0 flex-1 truncate text-cladd-xs">{player.name}</span>
      <span className="text-cladd-xs text-cladd-fg-softer">{player.position}</span>
      <span className="flex">
        <IconButton
          label={`Move ${player.name} earlier`}
          size="sm"
          disabled={index === 0}
          onClick={() => nudgeInGroup(group.id, playerId, -1)}
        >
          <ArrowUp />
        </IconButton>
        <IconButton
          label={`Move ${player.name} later`}
          size="sm"
          disabled={index === group.playerIds.length - 1}
          onClick={() => nudgeInGroup(group.id, playerId, 1)}
        >
          <ArrowDown />
        </IconButton>
        <IconButton
          label={`Remove ${player.name} from ${group.name}`}
          size="sm"
          onClick={() => removeFromGroup(group.id, playerId)}
        >
          <X />
        </IconButton>
      </span>
    </li>
  );
}

/** The group's members: identity and the routine action (add) in the header, order below. */
function GroupMembers({ group, team }: { group: PlayerGroup; team: Team }) {
  const override = usePicta((state) => state.doc.show.data.event.liveGroups[group.id]);
  const available = team.players.filter((player) => !group.playerIds.includes(player.id));
  const full = group.maxPlayers !== undefined && group.playerIds.length >= group.maxPlayers;
  return (
    <>
      <Panel row className="h-cladd-2xl shrink-0 border-b" contentClassName="gap-3 px-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-cladd-sm leading-tight font-semibold">{group.name}</h3>
          <p className="truncate text-cladd-xs leading-tight text-cladd-fg-soft tabular">
            {group.playerIds.length}
            {group.maxPlayers !== undefined ? ` of ${group.maxPlayers}` : ''} player
            {group.playerIds.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="w-44 shrink-0">
          <Select
            aria-label="Add a player to this group"
            disabled={available.length === 0 || full}
            options={available.map((player) => player.id)}
            value=""
            onChange={(value) => {
              if (value) addToGroup(group.id, value);
            }}
            renderOption={({ value }) => {
              const player = available.find((item) => item.id === value);
              return player ? playerLabel(player) : value;
            }}
          >
            <span className="text-cladd-fg-soft">
              {full
                ? `${group.name} is full`
                : available.length === 0
                  ? 'Everyone is in this group'
                  : 'Add a player…'}
            </span>
          </Select>
        </div>
      </Panel>
      {override && (
        <Banner tone="warn">
          Tonight this group has {override.length} player{override.length === 1 ? '' : 's'} from
          substitutions in the Console. This is the saved team order.
        </Banner>
      )}
      <Scroll>
        {group.playerIds.length === 0 ? (
          <EmptyState title="This group is empty">
            Add players above. Order matters: lineups present in this order.
          </EmptyState>
        ) : (
          <SortableArea
            ids={group.playerIds}
            onMove={(active, over) => moveInGroup(group.id, active, over)}
          >
            <ol aria-label={`${group.name} order`}>
              {group.playerIds.map((id, index) => (
                <MemberRow key={id} group={group} team={team} playerId={id} index={index} />
              ))}
            </ol>
          </SortableArea>
        )}
      </Scroll>
    </>
  );
}

/** Properties of the selected group. Deleting is its own section at the end. */
function GroupInspector({ group }: { group: PlayerGroup }) {
  return (
    <>
      <InspectorHeader
        title={group.name}
        subtitle={`${group.playerIds.length} player${group.playerIds.length === 1 ? '' : 's'}`}
      />
      <InspectorSection title="Group">
        <PropertyRow label="Name" stacked>
          <span className="min-w-0 flex-1 truncate">{group.name}</span>
          <Button size="sm" onClick={() => void renameGroup(group.id)}>
            <Pencil />
            Rename…
          </Button>
        </PropertyRow>
        <PropertyRow label="Maximum players">
          <CommitInput
            type="number"
            min={1}
            label="Maximum players"
            placeholder="None"
            value={group.maxPlayers === undefined ? '' : String(group.maxPlayers)}
            onCommit={(value) => setGroupMax(group.id, value.trim() === '' ? null : Number(value))}
            className="w-24"
            inputClassName="tabular"
          />
        </PropertyRow>
        <p className="text-cladd-xs leading-snug text-cladd-fg-softer">
          Lineups present players in the order listed here. Leave the maximum empty for no limit.
        </p>
      </InspectorSection>
      <InspectorSection title="Delete">
        <ActionButton intent="danger" onClick={() => deleteGroup(group.id)}>
          <Trash2 />
          Delete Group
        </ActionButton>
        <p className="text-cladd-xs text-cladd-fg-softer">Players stay on the roster.</p>
      </InspectorSection>
    </>
  );
}

/** The team's groups: a column beside the members, or a strip above them when the workspace is narrow. */
function GroupList({
  team,
  groupId,
  strip,
}: {
  team: Team;
  groupId: string | undefined;
  strip: boolean;
}) {
  const items = team.groups.map((item) => {
    const selected = item.id === groupId;
    return (
      <ListButton
        key={item.id}
        selected={selected}
        color={selected ? 'brand' : ''}
        aria-current={selected}
        onClick={() => selectGroup(item.id)}
        className={strip ? 'w-auto shrink-0' : ''}
        after={
          <span className="text-cladd-fg-softer tabular">
            {item.playerIds.length}
            {item.maxPlayers !== undefined ? `/${item.maxPlayers}` : ''}
          </span>
        }
      >
        <span className="truncate">{item.name}</span>
      </ListButton>
    );
  });
  if (strip)
    return (
      <Panel
        as="aside"
        aria-label="Groups"
        row
        className="shrink-0 border-b"
        contentClassName="gap-1 overflow-x-auto p-1.5"
      >
        {items}
        <Button className="shrink-0" onClick={() => void createGroup()}>
          <Plus />
          New Group…
        </Button>
      </Panel>
    );
  return (
    <Panel
      as="aside"
      aria-label="Groups"
      className="w-56 shrink-0 border-r @max-[860px]/ws:w-48 @max-[560px]/ws:max-h-36 @max-[560px]/ws:w-full @max-[560px]/ws:border-r-0 @max-[560px]/ws:border-b"
    >
      <Scroll>
        <List className="gap-0.5 p-1.5">{items}</List>
      </Scroll>
      <div className="border-t p-2">
        <Button className="w-full" onClick={() => void createGroup()}>
          <Plus />
          New Group…
        </Button>
      </div>
    </Panel>
  );
}

export function GroupsPane() {
  const team = useTeam();
  const selectedId = usePicta((state) => state.selectedGroupId);
  const [ref, width] = useWidth<HTMLDivElement>();
  if (!team) return null;
  const group = team.groups.find((item) => item.id === selectedId) ?? team.groups[0];
  // Three columns need room for a useful member list. Below that the groups
  // become a strip above. (Unmeasured, as in tests, counts as wide.)
  const strip = width > 0 && width < 760;
  return (
    <div ref={ref} className="flex min-h-0 min-w-0 flex-1 flex-col @max-[560px]/ws:flex-none">
      {strip && <GroupList team={team} groupId={group?.id} strip />}
      <div className="flex min-h-0 flex-1 @max-[560px]/ws:flex-none @max-[560px]/ws:flex-col">
        {!strip && <GroupList team={team} groupId={group?.id} strip={false} />}
        <WorkspaceMain>
          {group ? (
            <GroupMembers group={group} team={team} />
          ) : (
            <EmptyState title="No groups yet">
              Groups are ordered lists of players: a starting lineup, the players on the floor,
              seniors.
            </EmptyState>
          )}
        </WorkspaceMain>
        {group && (
          <Inspector label="Group">
            <GroupInspector group={group} />
          </Inspector>
        )}
      </div>
    </div>
  );
}
