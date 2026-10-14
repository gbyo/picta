import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Ellipsis,
  Flag,
  Minus,
  Plus,
  RotateCcw,
  Trophy,
  Undo2,
  Volleyball,
} from 'lucide-react';
import type { ScoreSide, VolleyballScoreState } from '@core/domain.js';
import {
  isMatchPoint,
  matchSetLimit,
  matchWinner,
  previewEndSet,
  setPointSide,
  setPointTarget,
  sidePoints,
  sideSets,
  undoDescription,
} from '@core/score.js';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Hint, Keys } from '@/components/picta/hint';
import { cn } from '@/lib/utils';
import { usePicta } from '@/state/store';
import { useScore } from '@/hooks';
import { endSet, rally, resetMatch, scoreAction, undoScoreAction } from '@/actions/match';

function InlineName({ side, score }: { side: ScoreSide; score: VolleyballScoreState }) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  const name = score[side].name;
  if (editing)
    return (
      <input
        ref={input}
        defaultValue={name}
        maxLength={40}
        aria-label={`${side === 'home' ? 'Left' : 'Right'} team name`}
        className="h-7 w-full min-w-0 rounded-[4px] border border-accent bg-sunken px-1.5 text-[14px] font-semibold text-fg outline-none"
        onBlur={(event) => {
          scoreAction({ type: 'team-name', side, value: event.currentTarget.value });
          setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setEditing(false);
        }}
      />
    );
  return (
    <Hint label="Double-click to rename">
      <button
        type="button"
        onDoubleClick={() => setEditing(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'F2') {
            event.preventDefault();
            setEditing(true);
          }
        }}
        className="h-7 min-w-0 truncate rounded-[4px] px-1 text-left text-[14px] font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {name}
      </button>
    </Hint>
  );
}

function SetDots({ won, needed, color }: { won: number; needed: number; color: string }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: Math.max(needed, won) }, (_, index) => (
        <span
          key={index}
          className={cn(
            'size-2.5 rounded-full border',
            index < won ? 'border-transparent' : 'border-line-strong',
          )}
          style={index < won ? { background: color } : undefined}
        />
      ))}
    </span>
  );
}

function TeamBlock({
  side,
  score,
  final,
  shortcut,
  setPoint,
}: {
  side: ScoreSide;
  score: VolleyballScoreState;
  final: boolean;
  shortcut: string;
  setPoint: boolean;
}) {
  const team = score[side];
  const points = sidePoints(score, side);
  const sets = sideSets(score, side);
  const serving = score.serving === side;
  const needed = Math.ceil(matchSetLimit(score) / 2);
  const winner = matchWinner(score) === side;
  const sideLabel = side === 'home' ? 'left' : 'right';
  return (
    <section
      aria-label={`${team.name} (${sideLabel})`}
      className={cn(
        'relative flex min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-lg border bg-raised p-3 pl-4',
        serving ? 'border-line-strong' : 'border-line',
      )}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: team.primaryColor }}
        aria-hidden
      />
      <div className="flex min-w-0 items-center gap-2">
        <InlineName side={side} score={score} />
        {setPoint && !final && (
          <span className="shrink-0 rounded-[3px] bg-warn-soft px-1.5 py-0.5 text-[11px] font-bold tracking-[0.08em] text-warn">
            {isMatchPoint(score) ? 'MATCH PT' : 'SET PT'}
          </span>
        )}
        {winner && (
          <span className="flex shrink-0 items-center gap-1 rounded-[3px] bg-ok-soft px-1.5 py-0.5 text-[11px] font-bold tracking-[0.08em] text-ok">
            <Trophy className="size-3" />
            WINNER
          </span>
        )}
        <Hint label={serving ? `${team.name} is serving` : `Give ${team.name} the serve`}>
          <button
            type="button"
            aria-pressed={serving}
            aria-label={`${team.name} serving`}
            disabled={final}
            onClick={() => scoreAction({ type: 'serve', side: serving ? null : side })}
            className={cn(
              'ml-auto flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40',
              serving
                ? 'bg-[#ffe36b] text-black'
                : 'text-fg-faint hover:bg-raised-hover hover:text-fg-muted',
            )}
          >
            <Volleyball className="size-3" />
            {serving ? 'SERVING' : 'Serve'}
          </button>
        </Hint>
      </div>
      <div className="flex items-end justify-between gap-2">
        <output
          aria-label={`${team.name} points`}
          className="text-[clamp(44px,7vw,76px)] leading-[0.85] font-bold tracking-[-0.04em] text-fg tabular"
        >
          {points}
        </output>
        <div className="flex flex-col items-end gap-1.5 pb-1">
          <span className="flex items-center gap-1.5">
            <span className="text-[11px] text-fg-faint">Sets</span>
            <SetDots won={sets} needed={needed} color={team.primaryColor} />
            <span
              className="w-3 text-[12px] font-semibold text-fg tabular"
              aria-label={`${team.name} sets won`}
            >
              {sets}
            </span>
          </span>
          <span className="flex gap-0.5">
            <Hint label={`Take a point away from ${team.name} (correction)`}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove a point from ${team.name}`}
                disabled={points === 0}
                onClick={() => scoreAction({ type: 'point', side, delta: -1 })}
              >
                <Minus />
              </Button>
            </Hint>
          </span>
        </div>
      </div>
      <Hint label={`${team.name} won the rally: +1 and they serve`} keys={[shortcut]}>
        <Button
          variant="default"
          className="h-11 w-full justify-between bg-raised-hover px-3 text-[14px] font-semibold hover:brightness-125"
          disabled={final}
          onClick={() => rally(side)}
          aria-label={`Point ${team.name}`}
        >
          <span className="flex items-center gap-2">
            <Plus className="size-4" />
            Point
          </span>
          <Keys keys={[shortcut]} />
        </Button>
      </Hint>
    </section>
  );
}

/**
 * Volleyball scoring as an operator console: one big target per team, the
 * serve follows the rally, Undo names what it reverses, and End Set says what
 * it is about to do before it does it.
 */
export function ScoreController() {
  const score = useScore();
  const history = usePicta((state) => state.scoreHistory);
  const undoLabel = history.present === score ? undoDescription(history) : null;
  const winner = matchWinner(score);
  const preview = previewEndSet(score);
  const setPoint = setPointSide(score);
  const final = winner !== null;

  return (
    <section aria-label="Match" className="flex flex-col gap-2">
      <div className="flex h-8 items-center gap-2">
        <h2 className="label-caps">Match</h2>
        <span className="text-[12px] text-fg-muted">
          {final ? (
            <span className="font-semibold text-ok">
              Final · {score[winner].name} wins {sideSets(score, winner)}–
              {sideSets(score, winner === 'home' ? 'away' : 'home')}
            </span>
          ) : (
            <>
              Set {score.setNumber} of {matchSetLimit(score)} · to {setPointTarget(score)}, win by 2
            </>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <MatchMenu score={score} />
        </div>
      </div>
      <div className="flex gap-2">
        <TeamBlock
          side="home"
          score={score}
          final={final}
          shortcut="Q"
          setPoint={setPoint === 'home'}
        />
        <TeamBlock
          side="away"
          score={score}
          final={final}
          shortcut="P"
          setPoint={setPoint === 'away'}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Hint label={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'} keys={['Z']}>
          <Button disabled={!undoLabel} onClick={undoScoreAction} className="max-w-[46%]">
            <Undo2 />
            <span className="truncate">{undoLabel ? `Undo · ${undoLabel}` : 'Undo'}</span>
          </Button>
        </Hint>
        <Hint label="Swap the teams' sides on the scoreboard">
          <Button variant="ghost" onClick={() => scoreAction({ type: 'swap-sides' })}>
            <ArrowLeftRight />
            Swap sides
          </Button>
        </Hint>
        <div className="ml-auto">
          {final ? (
            <Button onClick={() => void resetMatch()}>
              <RotateCcw />
              New Match…
            </Button>
          ) : preview.kind === 'ready' ? (
            <Hint
              label={
                preview.regulation
                  ? 'End the set now. Undo reverses it.'
                  : 'Not a standard finish. You will be asked to confirm.'
              }
            >
              {preview.regulation ? (
                <Button
                  variant="primary"
                  onClick={() => void endSet()}
                  aria-label={`End set ${score.setNumber}`}
                >
                  <Flag />
                  End Set {score.setNumber} · {score[preview.winner].name} {preview.winnerPoints}–
                  {preview.loserPoints}
                  {preview.endsMatch ? ' · Final' : ''}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => void endSet()}
                  aria-label={`End set ${score.setNumber}`}
                >
                  <Flag />
                  End Set {score.setNumber}…
                </Button>
              )}
            </Hint>
          ) : (
            <Button disabled aria-label={`End set ${score.setNumber}`}>
              <Flag />
              End Set · tied
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function MatchMenu({ score }: { score: VolleyballScoreState }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Match options" />}
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Format</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={score.matchFormat}
          onValueChange={(value) =>
            scoreAction({
              type: 'match-format',
              value: value === 'best-of-3' ? 'best-of-3' : 'best-of-5',
            })
          }
        >
          <DropdownMenuRadioItem value="best-of-5">
            Best of 5 · first to 3 sets
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="best-of-3">
            Best of 3 · first to 2 sets
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Corrections</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={score.setNumber <= 1}
          onClick={() => scoreAction({ type: 'set-number', value: score.setNumber - 1 })}
        >
          Set number − 1 (now {score.setNumber})
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={score.setNumber >= matchSetLimit(score)}
          onClick={() => scoreAction({ type: 'set-number', value: score.setNumber + 1 })}
        >
          Set number + 1
        </DropdownMenuItem>
        {(['home', 'away'] as const).map((side) => (
          <DropdownMenuItem
            key={`${side}-up`}
            onClick={() =>
              scoreAction({ type: 'sets-won', side, value: sideSets(score, side) + 1 })
            }
          >
            {score[side].name} sets + 1
          </DropdownMenuItem>
        ))}
        {(['home', 'away'] as const).map((side) => (
          <DropdownMenuItem
            key={`${side}-down`}
            disabled={sideSets(score, side) === 0}
            onClick={() =>
              scoreAction({ type: 'sets-won', side, value: sideSets(score, side) - 1 })
            }
          >
            {score[side].name} sets − 1
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          disabled={score.serving === null}
          onClick={() => scoreAction({ type: 'serve', side: null })}
        >
          Clear serve
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <TeamColorItems score={score} />
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void resetMatch()}>
          <RotateCcw />
          Reset Score for a New Match…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TeamColorItems({ score }: { score: VolleyballScoreState }) {
  return (
    <div className="flex flex-col gap-1 px-2 py-1">
      <p className="text-[11px] text-fg-faint">Accent colours on the scoreboard</p>
      {(['home', 'away'] as const).map((side) => (
        <label key={side} className="flex items-center gap-2 text-[12px] text-fg">
          <input
            type="color"
            key={score[side].primaryColor}
            defaultValue={score[side].primaryColor}
            // Commit once when the picker closes, not on every drag step, so
            // Undo reverses the colour change in one step.
            onBlur={(event) =>
              scoreAction({ type: 'team-color', side, value: event.currentTarget.value })
            }
            className="h-5 w-7 cursor-pointer rounded-[3px] border border-line-strong bg-transparent p-0"
            aria-label={`${score[side].name} colour`}
          />
          <span className="truncate">{score[side].name}</span>
        </label>
      ))}
    </div>
  );
}
