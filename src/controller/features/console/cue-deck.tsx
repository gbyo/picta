import { useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Film,
  Hand,
  IdCard,
  ListOrdered,
  Play,
  Search,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import type { Player, PlayerGroup } from '@core/domain.js';
import { playerHasVideo } from '@core/player-cues.js';
import { manualPlayerShown, manualShownCount } from '@core/manual-group.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Hint } from '@/components/picta/hint';
import { EmptyState, SectionHeader } from '@/components/picta/section';
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
    <Film className="size-3.5 text-fg-muted" aria-label="Intro video" />
  ) : (
    <IdCard className="size-3.5 text-fg-faint" aria-label="Player card" />
  );
}

function CueTargetNote() {
  const screen = usePicta((state) => programScreen(state));
  const live = usePicta((state) => state.output.phase === 'live');
  const full = cueTargetFor(screen) === 'full-board';
  return (
    <p className="text-[11.5px] text-fg-muted">
      {live ? 'Cues appear in ' : 'When live, cues appear in '}
      <span className="font-medium text-fg">{describeCueTarget(screen).toLowerCase()}</span>
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
      <div className="flex items-center gap-2 rounded-md border border-cue/40 bg-cue-soft px-2.5 py-2">
        <Hand className="size-4 text-cue" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-[0.1em] text-cue">PRESENTING MANUALLY</p>
          <p className="truncate text-[12.5px] font-medium text-fg">
            {group?.name ?? 'Lineup'} · {shown} of {players.length} shown
          </p>
        </div>
        <Hint label="Unmark the most recently shown player">
          <Button
            variant="ghost"
            size="sm"
            disabled={shown === 0 || session.currentPlayerId !== null}
            onClick={undoManualLineup}
          >
            <Undo2 />
            Undo last
          </Button>
        </Hint>
        <Button variant="cue" size="sm" onClick={endManualLineup}>
          <X />
          End Lineup
        </Button>
      </div>
      <p className="text-[11.5px] text-fg-muted">
        Click players as the announcer calls them. A shown player can be shown again.
      </p>
      <ScrollArea className="min-h-0 flex-1">
        <ol className="flex flex-col gap-1">
          {players.map((player, index) => {
            const wasShown = manualPlayerShown(session, player.id);
            const presenting = session.currentPlayerId === player.id;
            return (
              <li key={player.id}>
                <button
                  type="button"
                  disabled={!presenting && (cueActive || session.currentPlayerId !== null)}
                  onClick={() => void presentManualPlayer(player.id)}
                  className={cn(
                    'flex h-11 w-full items-center gap-3 rounded-md border px-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50',
                    presenting
                      ? 'border-cue bg-cue-soft'
                      : wasShown
                        ? 'border-line bg-raised/50'
                        : 'border-line bg-raised hover:border-line-strong hover:bg-raised-hover',
                  )}
                >
                  <span className="w-4 text-[11px] text-fg-faint tabular">{index + 1}</span>
                  <span className="w-8 text-[16px] font-bold text-fg tabular">{player.number}</span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-[13px] font-medium',
                      wasShown ? 'text-fg-muted' : 'text-fg',
                    )}
                  >
                    {player.name}
                  </span>
                  <span className="text-[11px] text-fg-faint">{player.position}</span>
                  <PresentationIcon player={player} />
                  <span className="w-16 text-right text-[11px]">
                    {presenting ? (
                      <span className="font-semibold text-cue">ON AIR</span>
                    ) : wasShown ? (
                      <span className="inline-flex items-center gap-1 text-ok">
                        <Check className="size-3.5" />
                        Shown
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </ScrollArea>
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
    <li className="rounded-md border border-line bg-raised">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[4px] text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-fg-faint transition-transform',
              open && 'rotate-90',
            )}
          />
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium text-fg">{group.name}</span>
            <span className="block truncate text-[11px] text-fg-faint">
              {empty
                ? 'No players'
                : `${players.length} player${players.length === 1 ? '' : 's'} · ${videos ? `${videos} intro video${videos === 1 ? '' : 's'}, ` : ''}${players.length - videos} card${players.length - videos === 1 ? '' : 's'}`}
            </span>
          </span>
        </button>
        <Hint label="Present each player in this order, one after another">
          <Button
            variant="cue"
            size="sm"
            disabled={!live || busy || empty}
            onClick={() => void playGroupInOrder(group, ids)}
          >
            <Play className="size-3" />
            Play in order
          </Button>
        </Hint>
        <Hint label="Show players one at a time as the announcer calls them">
          <Button
            size="sm"
            disabled={!live || busy || empty}
            onClick={() => beginManualLineup(group, ids)}
          >
            <Hand className="size-3" />
            Manually
          </Button>
        </Hint>
      </div>
      {open && (
        <ol className="flex flex-col border-t border-line px-2 py-1.5">
          {players.map((player, index) => (
            <li key={player.id} className="flex h-6 items-center gap-2 text-[12px]">
              <span className="w-4 text-right text-[11px] text-fg-faint tabular">{index + 1}</span>
              <span className="w-7 font-semibold text-fg tabular">{player.number}</span>
              <span className="min-w-0 flex-1 truncate text-fg-muted">{player.name}</span>
              <PresentationIcon player={player} />
              <span className="w-16 text-[11px] text-fg-faint">
                {playerHasVideo(player) ? 'intro video' : 'card · 9s'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </li>
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
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-fg-faint" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Number or name"
          aria-label="Find a player"
          className="pl-7"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('');
          }}
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col">
          {players.map((player) => (
            <li
              key={player.id}
              className="group flex h-8 items-center gap-2 rounded-[4px] px-1.5 hover:bg-raised"
            >
              <span className="w-7 text-right text-[12.5px] font-semibold text-fg tabular">
                {player.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{player.name}</span>
              <span className="text-[11px] text-fg-faint">{player.position}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={!live || busy}
                onClick={() => void presentSinglePlayer(player.id, 'card')}
                aria-label={`Show card for ${playerLabel(player)}`}
              >
                <IdCard />
                Card
              </Button>
              <Hint label={playerHasVideo(player) ? 'Play intro video' : 'No usable intro video'}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!live || busy || !playerHasVideo(player)}
                  onClick={() => void presentSinglePlayer(player.id, 'video')}
                  aria-label={`Play intro for ${playerLabel(player)}`}
                >
                  <Film />
                  Intro
                </Button>
              </Hint>
            </li>
          ))}
        </ul>
      </ScrollArea>
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
        <p className="rounded-md bg-raised px-2.5 py-1.5 text-[11.5px] text-fg-muted">
          Cues need a live output. Everything here is ready as soon as you Go Live.
        </p>
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
