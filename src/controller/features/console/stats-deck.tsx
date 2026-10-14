import { useMemo, useState } from 'react';
import { ArrowLeftRight, Ellipsis, Film, IdCard, Undo2, Users } from 'lucide-react';
import type { Player, PlayerGroup, RawPlayerStats } from '@core/domain.js';
import { emptyRawStats, volleyballDerivedStats, type SportDefinition } from '@core/sports.js';
import { lastStatEntry } from '@core/stat-log.js';
import { playerHasVideo } from '@core/player-cues.js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Hint } from '@/components/picta/hint';
import { EmptyState } from '@/components/picta/section';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ask } from '@/state/dialogs';
import { usePicta } from '@/state/store';
import { defaultLiveGroup, effectiveGroupIds, programScreen, boardGroupFor } from '@/state/derive';
import { useDefinition, useShowData, useTeam } from '@/hooks';
import {
  recordStat,
  resetLiveMembership,
  setLiveMembership,
  setStat,
  setStatsGroup,
  substitute,
  undoLastStat,
} from '@/actions/match';
import { playerLabel, presentSinglePlayer } from '@/actions/cues';

function StatButton({
  player,
  stat,
  value,
  compound,
}: {
  player: Player;
  stat: SportDefinition['stats'][number];
  value: number;
  compound: string[];
}) {
  return (
    <ContextMenu>
      <Hint
        label={
          <>
            <b className="font-semibold">{stat.label}</b> +1
            {compound.length > 0 && (
              <span className="text-fg-muted"> · also counts {compound.join(', ')}</span>
            )}
            <span className="text-fg-faint"> · right-click to correct</span>
          </>
        }
      >
        <ContextMenuTrigger
          render={
            <button
              type="button"
              onClick={() => recordStat(player.id, stat.id, 1)}
              aria-label={`${stat.label} for ${playerLabel(player)}, now ${value}`}
              className="flex h-9 min-w-0 flex-col items-center justify-center rounded-[5px] border border-line bg-sunken/50 leading-none outline-none transition-colors hover:border-line-strong hover:bg-raised-hover focus-visible:ring-2 focus-visible:ring-accent active:bg-accent-soft"
            />
          }
        >
          <span className="text-[11px] font-semibold tracking-[0.04em] text-fg-faint">
            {stat.shortLabel}
          </span>
          <span
            className={cn(
              'mt-0.5 text-[14px] font-semibold tabular',
              value > 0 ? 'text-fg' : 'text-fg-faint',
            )}
          >
            {value}
          </span>
        </ContextMenuTrigger>
      </Hint>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => recordStat(player.id, stat.id, 1)}>
          {stat.label} +1
        </ContextMenuItem>
        <ContextMenuItem disabled={value === 0} onClick={() => recordStat(player.id, stat.id, -1)}>
          {stat.label} −1
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void promptExactStat(player, stat, value)}>
          Set Exact Value…
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

async function promptExactStat(
  player: Player,
  stat: SportDefinition['stats'][number],
  value: number,
): Promise<void> {
  const answer = await ask.text({
    title: `${stat.label} for ${playerLabel(player)}`,
    label: 'Value',
    initialValue: String(value),
    confirmLabel: 'Set',
    maxLength: 4,
    validate: (text) => (/^\d{1,4}$/.test(text) ? null : 'Enter a whole number from 0 to 9999.'),
  });
  if (answer !== null) setStat(player.id, stat.id, Number(answer));
}

function Derived({ definition, stats }: { definition: SportDefinition; stats: RawPlayerStats }) {
  if (definition.id !== 'volleyball') return null;
  const derived = volleyballDerivedStats(stats);
  const hit = derived.hittingPercentage;
  return (
    <span className="text-[11px] text-fg-faint tabular">
      Hit {hit === null ? '—' : hit.toFixed(3).replace(/^0/, '').replace(/^-0/, '-')} · Blk{' '}
      {derived.totalBlocks} · Pts {derived.points}
    </span>
  );
}

function PlayerTile({
  player,
  definition,
  stats,
  group,
  bench,
  live,
}: {
  player: Player;
  definition: SportDefinition;
  stats: RawPlayerStats;
  group: PlayerGroup;
  bench: Player[];
  live: boolean;
}) {
  return (
    <article
      aria-label={playerLabel(player)}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-raised p-2.5"
    >
      <header className="flex min-w-0 items-center gap-2">
        <span className="w-7 shrink-0 text-[17px] font-bold text-fg tabular">{player.number}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-fg">{player.name}</span>
          <Derived definition={definition} stats={stats} />
        </span>
        {player.position && (
          <span className="shrink-0 text-[11px] font-medium text-fg-faint">{player.position}</span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`${player.name} options`} />}
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              disabled={!live}
              onClick={() => void presentSinglePlayer(player.id, 'card')}
            >
              <IdCard />
              Show Player Card
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!live || !playerHasVideo(player)}
              onClick={() => void presentSinglePlayer(player.id, 'video')}
            >
              <Film />
              Play Intro Video
            </DropdownMenuItem>
            {!live && <DropdownMenuLabel>Go live to present players</DropdownMenuLabel>}
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={bench.length === 0}>
                <ArrowLeftRight />
                Substitute…
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                {bench.map((other) => (
                  <DropdownMenuItem
                    key={other.id}
                    onClick={() => substitute(group.id, player.id, other.id)}
                  >
                    {playerLabel(other)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={() => setLiveMembership(group.id, player.id, false)}>
              Take out of {group.name}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${Math.min(definition.stats.length, 5)}, minmax(0, 1fr))`,
        }}
      >
        {definition.stats.map((stat) => (
          <StatButton
            key={stat.id}
            player={player}
            stat={stat}
            value={stats[stat.id] ?? 0}
            compound={(definition.compoundActions?.[stat.id] ?? []).map(
              (id) => definition.stats.find((item) => item.id === id)?.label ?? id,
            )}
          />
        ))}
      </div>
    </article>
  );
}

function LineupEditor({ group, members }: { group: PlayerGroup; members: Set<string> }) {
  const team = useTeam();
  const overridden = usePicta((state) => group.id in state.doc.show.data.event.liveGroups);
  if (!team) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-fg">
          {group.name}
          <span className="ml-1.5 text-fg-faint tabular">
            {members.size}
            {group.maxPlayers !== undefined ? ` / ${group.maxPlayers}` : ''}
          </span>
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={!overridden}
          onClick={() => resetLiveMembership(group.id)}
        >
          Use saved group
        </Button>
      </div>
      <ScrollArea className="max-h-72">
        <ul className="flex flex-col">
          {team.players.map((player) => {
            const checked = members.has(player.id);
            const full = group.maxPlayers !== undefined && members.size >= group.maxPlayers;
            return (
              <li key={player.id}>
                <label
                  className={cn(
                    'flex h-7 items-center gap-2 rounded-[4px] px-1.5 text-[12px] hover:bg-raised-hover',
                    !checked && full && 'opacity-50',
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={!checked && full}
                    onCheckedChange={(value) =>
                      setLiveMembership(group.id, player.id, value === true)
                    }
                  />
                  <span className="w-6 text-right text-fg-muted tabular">{player.number}</span>
                  <span className="truncate text-fg">{player.name}</span>
                  <span className="ml-auto text-[11px] text-fg-faint">{player.position}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
      <p className="text-[11px] leading-snug text-fg-faint">
        Changes here are tonight only. They are saved with the show, never with the team.
      </p>
    </div>
  );
}

/** Live statistics for the players on the floor, one tile per player. */
export function StatsDeck() {
  const team = useTeam();
  const definition = useDefinition();
  const data = useShowData();
  const chosenGroupId = usePicta((state) => state.statsGroupId);
  const live = usePicta((state) => state.output.phase === 'live');
  const boardGroupId = usePicta(
    (state) => boardGroupFor(programScreen(state), state.doc.show.data.team?.data)?.id,
  );
  const statLog = usePicta((state) => state.statLog);
  const [showBench, setShowBench] = useState(false);

  const group = useMemo(() => {
    if (!team) return undefined;
    return (
      team.groups.find((item) => item.id === chosenGroupId) ??
      team.groups.find((item) => item.id === boardGroupId) ??
      defaultLiveGroup(team)
    );
  }, [team, chosenGroupId, boardGroupId]);

  const memberIds = useMemo(() => (group ? effectiveGroupIds(data, group) : []), [data, group]);
  const members = useMemo(
    () =>
      memberIds
        .map((id) => team?.players.find((player) => player.id === id))
        .filter((player): player is Player => player !== undefined),
    [memberIds, team],
  );
  const memberSet = useMemo(() => new Set(memberIds), [memberIds]);
  const bench = useMemo(
    () => team?.players.filter((player) => !memberSet.has(player.id)) ?? [],
    [team, memberSet],
  );

  if (!team || !definition)
    return (
      <EmptyState icon={<Users />} title="No team in this show">
        Create or open a team in Roster to record live statistics and present players.
      </EmptyState>
    );
  if (definition.stats.length === 0)
    return (
      <EmptyState icon={<Users />} title={`${definition.name} has no statistics yet`}>
        Add statistics to this custom sport in Roster.
      </EmptyState>
    );
  if (!group)
    return (
      <EmptyState icon={<Users />} title="This team has no groups">
        Add a group in Roster, such as the players on the floor.
      </EmptyState>
    );

  const last = lastStatEntry(statLog);
  const lastPlayer = last ? team.players.find((player) => player.id === last.playerId) : undefined;
  const lastStat = last ? definition.stats.find((stat) => stat.id === last.statId) : undefined;
  const undoLabel =
    last && lastPlayer && lastStat
      ? `${playerLabel(lastPlayer)} ${lastStat.shortLabel} ${last.kind === 'add' ? '+1' : last.kind === 'subtract' ? '−1' : 'edit'}`
      : null;
  const stats = data.event.stats;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={group.id} onValueChange={(value) => setStatsGroup(value as string)}>
          <SelectTrigger className="h-7 min-w-36" aria-label="Group">
            <SelectValue>{() => group.name}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {team.groups.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
                {item.id === boardGroupId ? ' · on the board' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger render={<Button />}>
            <Users />
            Lineup
            <span className="text-fg-faint tabular">
              {members.length}
              {group.maxPlayers !== undefined ? `/${group.maxPlayers}` : ''}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 gap-2 p-3">
            <LineupEditor group={group} members={memberSet} />
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          aria-pressed={showBench}
          onClick={() => setShowBench((value) => !value)}
        >
          {showBench ? 'Hide bench' : `Bench (${bench.length})`}
        </Button>
        <div className="ml-auto">
          <Hint
            label={undoLabel ? `Undo the last stat: ${undoLabel}` : 'No stat to undo'}
            keys={['⇧', 'Z']}
          >
            <Button disabled={!undoLabel} onClick={undoLastStat}>
              <Undo2 />
              {undoLabel ? (
                <span className="max-w-48 truncate">Undo · {undoLabel}</span>
              ) : (
                'Undo stat'
              )}
            </Button>
          </Hint>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {members.length === 0 ? (
          <EmptyState title={`Nobody is in ${group.name}`}>
            Use Lineup to choose tonight's players.
          </EmptyState>
        ) : (
          <div
            className="grid gap-2 pb-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}
          >
            {members.map((player) => (
              <PlayerTile
                key={player.id}
                player={player}
                definition={definition}
                stats={stats[player.id] ?? emptyRawStats(definition)}
                group={group}
                bench={bench}
                live={live}
              />
            ))}
          </div>
        )}
        {showBench && bench.length > 0 && (
          <div className="mt-1 flex flex-col gap-1 border-t border-line pt-2">
            <p className="label-caps px-0.5 py-1">Bench</p>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}
            >
              {bench.map((player) => (
                <div key={player.id} className="opacity-80">
                  <PlayerTile
                    player={player}
                    definition={definition}
                    stats={stats[player.id] ?? emptyRawStats(definition)}
                    group={group}
                    bench={[]}
                    live={live}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
