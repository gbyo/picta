import { useMemo, useState } from 'react';
import { Button, List, ListButton, SearchField, Surface } from '@cladd-ui/react';
import {
  Check,
  ChevronRight,
  Film,
  Hand,
  IdCard,
  ListOrdered,
  Play,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import type { Player, PlayerGroup } from '@core/domain.js';
import { playerHasVideo } from '@core/player-cues.js';
import { manualPlayerShown, manualShownCount } from '@core/manual-group.js';
import { ActionButton } from '@/components/picta/controls';
import { Banner, EmptyState } from '@/components/picta/feedback';
import { Hint } from '@/components/picta/hint';
import { Scroll, SectionHeader } from '@/components/picta/workspace';
import { cn } from '@/lib/utils';
import { usePicta } from '@/state/store';
import { cueTargetFor, describeCueTarget, effectiveGroupIds, programScreen } from '@/state/derive';
import { useShowData, useTeam } from '@/hooks';
import {
  beginManualLineup,
  endManualLineup,
  playGroupInOrder,
  playerLabel,
  presentManualPlayer,
  presentSinglePlayer,
  undoManualLineup,
} from '@/actions/cues';

function PresentationIcon({ player }: { player: Player }) {
  return playerHasVideo(player) ? (
    <Film className="text-cladd-fg-soft" aria-label="Intro video" />
  ) : (
    <IdCard className="text-cladd-fg-softer" aria-label="Player card" />
  );
}

function CueTargetNote() {
  const screen = usePicta((state) => programScreen(state));
  const live = usePicta((state) => state.output.phase === 'live');
  const full = cueTargetFor(screen) === 'full-board';
  return (
    <p className="text-cladd-xs text-cladd-fg-soft">
      {live ? 'Cues appear in ' : 'When live, cues appear in '}
      <span className="font-semibold text-cladd-fg">{describeCueTarget(screen).toLowerCase()}</span>
      {full ? ` because ${screen.name} has no media panel` : ` of ${screen.name}`}, then the
      rotation resumes.
    </p>
  );
}

function ManualSession() {
  const session = usePicta((state) => state.manual);
  const team = useTeam();
  const cueActive = usePicta((state) => state.output.cue.state.active);
  if (!session || !team) return null;
  const group = team.groups.find((item) => item.id === session.groupId);
  const players = session.playerIds
    .map((id) => team.players.find((player) => player.id === id))
    .filter((player): player is Player => player !== undefined);
  const shown = manualShownCount(session);
  return (
    <section aria-label="Manual lineup" className="flex min-h-0 flex-1 flex-col gap-2">
      <Surface
        color="cue"
        variant="solid"
        outline
        level={2}
        className="shrink-0 rounded-cladd-md"
        contentClassName="flex items-center gap-2 px-2.5 py-2"
      >
        <Hand className="size-4 text-cue" />
        <div className="min-w-0 flex-1">
          <p className="text-cladd-xs font-bold tracking-wider text-cue">PRESENTING MANUALLY</p>
          <p className="truncate text-cladd-xs font-semibold">
            {group?.name ?? 'Lineup'} · {shown} of {players.length} shown
          </p>
        </div>
        <Hint label="Unmark the most recently shown player">
          <Button
            size="sm"
            variant="transparent"
            outline={false}
            disabled={shown === 0 || session.currentPlayerId !== null}
            onClick={undoManualLineup}
          >
            <Undo2 />
            Undo last
          </Button>
        </Hint>
        <ActionButton intent="cue" size="sm" onClick={endManualLineup}>
          <X />
          End Lineup
        </ActionButton>
      </Surface>
      <p className="text-cladd-xs text-cladd-fg-soft">
        Click players as the announcer calls them. A shown player can be shown again.
      </p>
      <Scroll>
        <List className="gap-1 p-0">
          {players.map((player, index) => {
            const wasShown = manualPlayerShown(session, player.id);
            const presenting = session.currentPlayerId === player.id;
            return (
              <ListButton
                key={player.id}
                size="xl"
                selected={presenting}
                color={presenting ? 'cue' : ''}
                outline={!presenting}
                variant="solid"
                disabled={!presenting && (cueActive || session.currentPlayerId !== null)}
                onClick={() => void presentManualPlayer(player.id)}
                titleClassName="gap-3"
                after={
                  presenting ? (
                    <span className="font-semibold text-cue">ON AIR</span>
                  ) : wasShown ? (
                    <span className="inline-flex items-center gap-1 text-ok">
                      <Check />
                      Shown
                    </span>
                  ) : null
                }
              >
                <span className="w-4 text-cladd-xs text-cladd-fg-softer tabular">{index + 1}</span>
                <span className="w-8 text-cladd-md font-bold tabular">{player.number}</span>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-cladd-sm',
                    wasShown && 'text-cladd-fg-soft',
                  )}
                >
                  {player.name}
                </span>
                <span className="text-cladd-xs font-normal text-cladd-fg-softer">
                  {player.position}
                </span>
                <PresentationIcon player={player} />
              </ListButton>
            );
          })}
        </List>
      </Scroll>
    </section>
  );
}

function LineupRow({ group, live, busy }: { group: PlayerGroup; live: boolean; busy: boolean }) {
  const data = useShowData();
  const team = useTeam();
  const [open, setOpen] = useState(false);
  const ids = effectiveGroupIds(data, group);
  const players = ids
    .map((id) => team?.players.find((player) => player.id === id))
    .filter((player): player is Player => player !== undefined);
  const videos = players.filter(playerHasVideo).length;
  const empty = players.length === 0;
  return (
    <Surface as="li" className="rounded-cladd-lg">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="focus-ring flex min-w-0 flex-1 items-center gap-1.5 rounded-cladd-md text-left"
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-cladd-fg-softer transition-transform',
              open && 'rotate-90',
            )}
          />
          <span className="min-w-0">
            <span className="block truncate text-cladd-xs font-semibold">{group.name}</span>
            <span className="block truncate text-cladd-xs text-cladd-fg-softer">
              {empty
                ? 'No players'
                : `${players.length} player${players.length === 1 ? '' : 's'} · ${videos ? `${videos} intro video${videos === 1 ? '' : 's'}, ` : ''}${players.length - videos} card${players.length - videos === 1 ? '' : 's'}`}
            </span>
          </span>
        </button>
        <Hint label="Present each player in this order, one after another">
          <ActionButton
            intent="cue"
            size="sm"
            disabled={!live || busy || empty}
            onClick={() => void playGroupInOrder(group, ids)}
          >
            <Play />
            Play in order
          </ActionButton>
        </Hint>
        <Hint label="Show players one at a time as the announcer calls them">
          <Button
            size="sm"
            disabled={!live || busy || empty}
            onClick={() => beginManualLineup(group, ids)}
          >
            <Hand />
            Manually
          </Button>
        </Hint>
      </div>
      {open && (
        <ol className="flex flex-col border-t px-2 py-1.5">
          {players.map((player, index) => (
            <li key={player.id} className="flex h-6 items-center gap-2 text-cladd-xs">
              <span className="w-4 text-right text-cladd-xs text-cladd-fg-softer tabular">
                {index + 1}
              </span>
              <span className="w-7 font-semibold tabular">{player.number}</span>
              <span className="min-w-0 flex-1 truncate text-cladd-fg-soft">{player.name}</span>
              <PresentationIcon player={player} />
              <span className="w-16 text-cladd-xs text-cladd-fg-softer">
                {playerHasVideo(player) ? 'intro video' : 'card · 9s'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Surface>
  );
}

function PlayerFinder({ live, busy }: { live: boolean; busy: boolean }) {
  const team = useTeam();
  const [query, setQuery] = useState('');
  const players = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    if (!team) return [];
    if (!value) return team.players;
    return team.players.filter(
      (player) =>
        player.number === value ||
        player.name.toLocaleLowerCase().includes(value) ||
        (player.position ?? '').toLocaleLowerCase() === value,
    );
  }, [team, query]);
  return (
    <section aria-label="Present a player" className="flex min-h-0 flex-1 flex-col gap-1.5">
      <SectionHeader label="Players" />
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Number or name"
        inputComponentProps={{ 'aria-label': 'Find a player' }}
      />
      <Scroll>
        <ul className="flex flex-col">
          {players.map((player) => (
            <li
              key={player.id}
              className="group flex h-cladd-lg items-center gap-2 rounded-cladd-md px-1.5 hover:bg-cladd-surface-hover"
            >
              <span className="w-7 text-right text-cladd-xs font-semibold tabular">
                {player.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-cladd-xs">{player.name}</span>
              <span className="text-cladd-xs text-cladd-fg-softer">{player.position}</span>
              <Button
                size="sm"
                variant="transparent"
                outline={false}
                disabled={!live || busy}
                onClick={() => void presentSinglePlayer(player.id, 'card')}
                aria-label={`Show card for ${playerLabel(player)}`}
              >
                <IdCard />
                Card
              </Button>
              <Hint label={playerHasVideo(player) ? 'Play intro video' : 'No usable intro video'}>
                <span className="inline-flex">
                  <Button
                    size="sm"
                    variant="transparent"
                    outline={false}
                    disabled={!live || busy || !playerHasVideo(player)}
                    onClick={() => void presentSinglePlayer(player.id, 'video')}
                    aria-label={`Play intro for ${playerLabel(player)}`}
                  >
                    <Film />
                    Intro
                  </Button>
                </span>
              </Hint>
            </li>
          ))}
        </ul>
      </Scroll>
    </section>
  );
}

/** Player and lineup presentations. */
export function CueDeck() {
  const team = useTeam();
  const live = usePicta((state) => state.output.phase === 'live');
  const busy = usePicta(
    (state) => state.output.cue.state.active || state.manual?.currentPlayerId != null,
  );
  const manual = usePicta((state) => state.manual !== null);
  if (!team)
    return (
      <EmptyState icon={<Users />} title="No team in this show">
        Create or open a team in Roster to present player cards, intro videos and lineups.
      </EmptyState>
    );
  if (manual) return <ManualSession />;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <CueTargetNote />
      {!live && (
        <Banner tone="info" variant="inline" icon={false}>
          Cues need a live output. Everything here is ready as soon as you Go Live.
        </Banner>
      )}
      <section aria-label="Lineups" className="flex flex-col gap-1.5">
        <SectionHeader
          label="Lineups"
          detail={
            <span className="inline-flex items-center gap-1">
              <ListOrdered className="size-3" />
              Groups in saved order
            </span>
          }
        />
        <ul className="flex flex-col gap-1.5">
          {team.groups.map((group) => (
            <LineupRow key={group.id} group={group} live={live} busy={busy} />
          ))}
        </ul>
      </section>
      <PlayerFinder live={live} busy={busy} />
    </div>
  );
}
