import { useMemo, useState } from 'react';
import { Button, Checkbox, Select, Surface, ToggleButton } from '@cladd-ui/react';
import { ArrowLeftRight, Ellipsis, Film, IdCard, Undo2, Users } from 'lucide-react';
import type { Player, PlayerGroup, RawPlayerStats } from '@core/domain.js';
import { emptyRawStats, volleyballDerivedStats, type SportDefinition } from '@core/sports.js';
import { lastStatEntry } from '@core/stat-log.js';
import { playerHasVideo } from '@core/player-cues.js';
import { EmptyState } from '@/components/picta/feedback';
import { Hint } from '@/components/picta/hint';
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuTrigger,
  ContextActions,
  ContextActionsContent,
  ContextActionsTrigger,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTitle,
} from '@/components/picta/menu';
import { PictaPopover } from '@/components/picta/popover';
import { Scroll, SectionHeader } from '@/components/picta/workspace';
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
    <ContextActions>
      <Hint
        label={
          <>
            <b className="font-semibold">{stat.label}</b> +1
            {compound.length > 0 && <span> · also counts {compound.join(', ')}</span>}
            <span className="text-cladd-fg-softer"> · right-click to correct</span>
          </>
        }
      >
        <ContextActionsTrigger
          render={
            <Surface
              as="button"
              type="button"
              hoverable
              clickable
              outline
              variant="gradient"
              onClick={() => recordStat(player.id, stat.id, 1)}
              aria-label={`${stat.label} for ${playerLabel(player)}, now ${value}`}
              className="focus-ring h-cladd-xl min-w-0 rounded-cladd-md"
              contentClassName="flex h-full flex-col items-center justify-center leading-none"
            />
          }
        >
          <span className="text-cladd-xs font-semibold text-cladd-fg-soft">{stat.shortLabel}</span>
          <span
            className={cn(
              'mt-0.5 text-cladd-sm font-semibold tabular',
              value === 0 && 'text-cladd-fg-softer',
            )}
          >
            {value}
          </span>
        </ContextActionsTrigger>
      </Hint>
      <ContextActionsContent className="min-w-48">
        <MenuItem onClick={() => recordStat(player.id, stat.id, 1)}>{stat.label} +1</MenuItem>
        <MenuItem disabled={value === 0} onClick={() => recordStat(player.id, stat.id, -1)}>
          {stat.label} −1
        </MenuItem>
        <MenuItem onClick={() => void promptExactStat(player, stat, value)}>
          Set Exact Value…
        </MenuItem>
      </ContextActionsContent>
    </ContextActions>
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
    <span className="text-cladd-2xs text-cladd-fg-softer tabular">
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
    <Surface
      as="article"
      aria-label={playerLabel(player)}
      className="min-w-0 rounded-cladd-lg"
      contentClassName="flex flex-col gap-2 p-2.5"
    >
      <header className="flex min-w-0 items-center gap-2">
        <span className="w-7 shrink-0 text-cladd-md font-bold tabular">{player.number}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-cladd-xs font-semibold">{player.name}</span>
          <Derived definition={definition} stats={stats} />
        </span>
        {player.position && (
          <span className="shrink-0 text-cladd-2xs font-medium text-cladd-fg-softer">
            {player.position}
          </span>
        )}
        <ActionMenu>
          <ActionMenuTrigger
            render={
              <Button
                square
                size="sm"
                variant="transparent"
                outline={false}
                aria-label={`${player.name} options`}
              >
                <Ellipsis />
              </Button>
            }
          />
          <ActionMenuContent align="end" className="min-w-56">
            <MenuItem
              icon={<IdCard />}
              disabled={!live}
              onClick={() => void presentSinglePlayer(player.id, 'card')}
            >
              Show Player Card
            </MenuItem>
            <MenuItem
              icon={<Film />}
              disabled={!live || !playerHasVideo(player)}
              onClick={() => void presentSinglePlayer(player.id, 'video')}
            >
              Play Intro Video
            </MenuItem>
            {!live && <MenuTitle>Go live to present players</MenuTitle>}
            <MenuSeparator />
            <MenuSub>
              <MenuSubTrigger icon={<ArrowLeftRight />} disabled={bench.length === 0}>
                Substitute…
              </MenuSubTrigger>
              <MenuSubContent className="min-w-52">
                {bench.map((other) => (
                  <MenuItem
                    key={other.id}
                    onClick={() => substitute(group.id, player.id, other.id)}
                  >
                    {playerLabel(other)}
                  </MenuItem>
                ))}
              </MenuSubContent>
            </MenuSub>
            <MenuItem onClick={() => setLiveMembership(group.id, player.id, false)}>
              Take out of {group.name}
            </MenuItem>
          </ActionMenuContent>
        </ActionMenu>
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
    </Surface>
  );
}

function LineupEditor({ group, members }: { group: PlayerGroup; members: Set<string> }) {
  const team = useTeam();
  const overridden = usePicta((state) => group.id in state.doc.show.data.event.liveGroups);
  if (!team) return null;
  return (
    <div className="flex flex-col gap-2 p-3">
      <SectionHeader
        label={group.name}
        detail={
          <span className="tabular">
            {members.size}
            {group.maxPlayers !== undefined ? ` / ${group.maxPlayers}` : ''}
          </span>
        }
        actions={
          <Button
            size="sm"
            variant="transparent"
            outline={false}
            disabled={!overridden}
            onClick={() => resetLiveMembership(group.id)}
          >
            Use saved group
          </Button>
        }
      />
      <ul className="flex max-h-72 flex-col overflow-y-auto">
        {team.players.map((player) => {
          const checked = members.has(player.id);
          const full = group.maxPlayers !== undefined && members.size >= group.maxPlayers;
          const disabled = !checked && full;
          return (
            <li key={player.id}>
              <label
                className={cn(
                  'flex h-cladd-md items-center gap-2 rounded-cladd-md px-1.5 text-cladd-xs hover:bg-cladd-surface-hover',
                  disabled && 'opacity-50',
                )}
              >
                <Checkbox
                  as="span"
                  checked={checked}
                  disabled={disabled}
                  onChange={(value) => setLiveMembership(group.id, player.id, value)}
                />
                <span className="w-6 text-right text-cladd-fg-soft tabular">{player.number}</span>
                <span className="truncate">{player.name}</span>
                <span className="ml-auto text-cladd-2xs text-cladd-fg-softer">
                  {player.position}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-cladd-2xs leading-snug text-cladd-fg-softer">
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
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Group"
          className="w-44"
          options={team.groups.map((item) => item.id)}
          value={group.id}
          onChange={(value) => setStatsGroup(value)}
          renderOption={({ value }) => {
            const item = team.groups.find((candidate) => candidate.id === value);
            return `${item?.name ?? value}${value === boardGroupId ? ' · on the board' : ''}`;
          }}
        >
          {group.name}
        </Select>
        <PictaPopover
          label={`${group.name} lineup`}
          width="md"
          contentClassName="p-0"
          trigger={
            <Button>
              <Users />
              Lineup
              <span className="text-cladd-fg-softer tabular">
                {members.length}
                {group.maxPlayers !== undefined ? `/${group.maxPlayers}` : ''}
              </span>
            </Button>
          }
        >
          <LineupEditor group={group} members={memberSet} />
        </PictaPopover>
        <ToggleButton
          selected={showBench}
          onChange={setShowBench}
          variant="transparent"
          outline={false}
        >
          {showBench ? 'Hide bench' : `Bench (${bench.length})`}
        </ToggleButton>
        <div className="ml-auto flex max-w-full">
          <Hint
            label={undoLabel ? `Undo the last stat: ${undoLabel}` : 'No stat to undo'}
            keys={['⇧', 'Z']}
          >
            <span className="inline-flex max-w-full">
              <Button disabled={!undoLabel} onClick={undoLastStat} className="max-w-full">
                <Undo2 />
                <span className="truncate">{undoLabel ? `Undo · ${undoLabel}` : 'Undo stat'}</span>
              </Button>
            </span>
          </Hint>
        </div>
      </div>
      <Scroll>
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
          <div className="mt-1 flex flex-col gap-1 border-t pt-2">
            <SectionHeader label="Bench" />
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
      </Scroll>
    </div>
  );
}
