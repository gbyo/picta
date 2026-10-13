import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { PlayerGroup, Team } from '@core/domain.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Hint } from '@/components/picta/hint';
import { EmptyState } from '@/components/picta/section';
import { SortableArea, useSortableItem } from '@/components/picta/sortable';
import { cn } from '@/lib/utils';
import { usePicta } from '@/state/store';
import { useTeam } from '@/hooks';
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
        'flex h-9 items-center gap-2 border-b border-line px-2',
        sortable.dragging ? 'bg-raised shadow-pop' : 'hover:bg-raised/60',
      )}
    >
      <button
        type="button"
        ref={sortable.handleRef}
        {...sortable.attributes}
        {...sortable.listeners}
        aria-label={`Reorder ${player.name}`}
        className="flex h-7 w-5 cursor-grab items-center justify-center rounded-[4px] text-fg-faint outline-none hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-accent"
      >
        <GripVertical className="size-3.5" />
      </button>
      <span className="w-5 text-right text-[10.5px] text-fg-faint tabular">{index + 1}</span>
      <span className="w-8 text-[13px] font-semibold text-fg tabular">{player.number}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{player.name}</span>
      <span className="text-[11px] text-fg-faint">{player.position}</span>
      <span className="flex">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${player.name} earlier`}
          disabled={index === 0}
          onClick={() => nudgeInGroup(group.id, playerId, -1)}
        >
          <ArrowUp />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${player.name} later`}
          disabled={index === group.playerIds.length - 1}
          onClick={() => nudgeInGroup(group.id, playerId, 1)}
        >
          <ArrowDown />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${player.name} from ${group.name}`}
          onClick={() => removeFromGroup(group.id, playerId)}
        >
          <X />
        </Button>
      </span>
    </li>
  );
}

function GroupEditor({ group, team }: { group: PlayerGroup; team: Team }) {
  const override = usePicta((state) => state.doc.show.data.event.liveGroups[group.id]);
  const available = team.players.filter((player) => !group.playerIds.includes(player.id));
  const full = group.maxPlayers !== undefined && group.playerIds.length >= group.maxPlayers;
  const [maxDraft, setMaxDraft] = useState<string | null>(null);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <h3 className="text-[14px] font-semibold text-fg">{group.name}</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Rename group"
          onClick={() => void renameGroup(group.id)}
        >
          <Pencil />
        </Button>
        <span className="text-[12px] text-fg-faint tabular">
          {group.playerIds.length}
          {group.maxPlayers !== undefined ? ` of ${group.maxPlayers}` : ''} player
          {group.playerIds.length === 1 ? '' : 's'}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-[11.5px] text-fg-muted">
          Limit
          <Input
            type="number"
            min={1}
            aria-label="Maximum players"
            placeholder="None"
            value={maxDraft ?? (group.maxPlayers === undefined ? '' : String(group.maxPlayers))}
            onChange={(event) => setMaxDraft(event.currentTarget.value)}
            onBlur={() => {
              if (maxDraft !== null)
                setGroupMax(group.id, maxDraft.trim() === '' ? null : Number(maxDraft));
              setMaxDraft(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            className="w-16 tabular"
          />
        </label>
        <Hint label="Delete this group. Players stay on the roster.">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete group"
            className="text-danger hover:text-danger"
            onClick={() => deleteGroup(group.id)}
          >
            <Trash2 />
          </Button>
        </Hint>
      </div>
      {override && (
        <p className="border-b border-line bg-warn-soft px-3 py-1.5 text-[11.5px] text-fg">
          Tonight this group has {override.length} player{override.length === 1 ? '' : 's'} from
          substitutions in the Console. This is the saved team order.
        </p>
      )}
      <ScrollArea className="min-h-0 flex-1">
        {group.playerIds.length === 0 ? (
          <EmptyState title="This group is empty">
            Add players below. Order matters: lineups present in this order.
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
        <div className="flex items-center gap-2 p-3">
          <Select
            value=""
            disabled={available.length === 0 || full}
            onValueChange={(value) => {
              if (value) addToGroup(group.id, String(value));
            }}
          >
            <SelectTrigger className="w-64" aria-label="Add a player to this group">
              <SelectValue>
                {() =>
                  full
                    ? `${group.name} is full`
                    : available.length === 0
                      ? 'Everyone is in this group'
                      : 'Add a player…'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {available.map((player) => (
                <SelectItem key={player.id} value={player.id}>
                  {playerLabel(player)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </ScrollArea>
    </div>
  );
}

export function GroupsPane() {
  const team = useTeam();
  const selectedId = usePicta((state) => state.selectedGroupId);
  if (!team) return null;
  const group = team.groups.find((item) => item.id === selectedId) ?? team.groups[0];
  return (
    <div className="flex h-full min-h-0">
      <aside
        aria-label="Groups"
        className="flex w-60 shrink-0 flex-col border-r border-line bg-surface"
      >
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col p-1.5">
            {team.groups.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === group?.id}
                  onClick={() => selectGroup(item.id)}
                  className={cn(
                    'flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    item.id === group?.id
                      ? 'bg-raised text-fg'
                      : 'text-fg-muted hover:bg-raised/60 hover:text-fg',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="text-[11px] text-fg-faint tabular">
                    {item.playerIds.length}
                    {item.maxPlayers !== undefined ? `/${item.maxPlayers}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
        <div className="border-t border-line p-2">
          <Button className="w-full" onClick={() => void createGroup()}>
            <Plus />
            New Group…
          </Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {group ? (
          <GroupEditor group={group} team={team} />
        ) : (
          <EmptyState title="No groups yet">
            Groups are ordered lists of players: a starting lineup, the players on the floor,
            seniors.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
