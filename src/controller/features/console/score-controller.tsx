import { useEffect, useRef, useState } from 'react';
import { Button, Chip, Surface } from '@cladd-ui/react';
import { Flag, Minus, Plus, RotateCcw, Trophy, Undo2, Volleyball } from 'lucide-react';
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
import { ActionButton, IconButton, INLINE_INPUT } from '@/components/picta/controls';
import { Hint, Keys } from '@/components/picta/hint';
import { SectionHeader } from '@/components/picta/workspace';
import { cn } from '@/lib/utils';
import { usePicta } from '@/state/store';
import { useScore } from '@/hooks';
import { endSet, rally, resetMatch, scoreAction, undoScoreAction } from '@/actions/match';
import { MatchMenu } from './match-menu';

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
        className={cn(INLINE_INPUT, 'h-cladd-lg text-cladd-sm font-semibold')}
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
        className="focus-ring h-cladd-lg min-w-0 truncate rounded-cladd-md px-1 text-left text-cladd-sm font-semibold"
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
            index < won ? 'border-transparent' : 'border-cladd-outline',
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
    <Surface
      as="section"
      aria-label={`${team.name} (${sideLabel})`}
      outline={serving}
      className="min-w-0 flex-1 overflow-hidden rounded-cladd-lg"
      contentClassName="flex flex-col gap-2 p-3 pl-4"
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: team.primaryColor }}
        aria-hidden
      />
      <div className="flex min-w-0 items-center gap-2">
        <InlineName side={side} score={score} />
        {setPoint && !final && (
          <Chip color="warn" variant="gradient" className="shrink-0 font-bold tracking-wider">
            {isMatchPoint(score) ? 'MATCH PT' : 'SET PT'}
          </Chip>
        )}
        {winner && (
          <Chip
            color="ok"
            variant="gradient"
            icon={Trophy}
            className="shrink-0 font-bold tracking-wider"
          >
            WINNER
          </Chip>
        )}
        <Hint label={serving ? `${team.name} is serving` : `Give ${team.name} the serve`}>
          <Button
            size="sm"
            rounded
            aria-pressed={serving}
            aria-label={`${team.name} serving`}
            disabled={final}
            // The yellow is the ball: serve is data, not a warning.
            color={serving ? 'yellow' : ''}
            variant={serving ? 'gradient-fill' : 'transparent'}
            outline={serving}
            className="ml-auto shrink-0"
            onClick={() => scoreAction({ type: 'serve', side: serving ? null : side })}
          >
            <Volleyball />
            {serving ? 'SERVING' : 'Serve'}
          </Button>
        </Hint>
      </div>
      <div className="flex items-end justify-between gap-2">
        <output
          aria-label={`${team.name} points`}
          className="text-[clamp(44px,7vw,76px)] leading-[0.85] font-bold tracking-[-0.04em] tabular"
        >
          {points}
        </output>
        <div className="flex flex-col items-end gap-1.5 pb-1">
          <span className="flex items-center gap-1.5 text-cladd-xs">
            <span className="text-cladd-fg-softer">Sets</span>
            <SetDots won={sets} needed={needed} color={team.primaryColor} />
            <span className="w-3 font-semibold tabular" aria-label={`${team.name} sets won`}>
              {sets}
            </span>
          </span>
          <IconButton
            label={`Remove a point from ${team.name}`}
            size="sm"
            disabled={points === 0}
            onClick={() => scoreAction({ type: 'point', side, delta: -1 })}
          >
            <Minus />
          </IconButton>
        </div>
      </div>
      <Hint label={`${team.name} won the rally: +1 and they serve`} keys={[shortcut]}>
        <Button
          size="xl"
          className="w-full text-cladd-sm"
          contentClassName="justify-between"
          disabled={final}
          onClick={() => rally(side)}
          aria-label={`Point ${team.name}`}
        >
          <span className="flex items-center gap-2">
            <Plus />
            Point
          </span>
          <Keys keys={[shortcut]} />
        </Button>
      </Hint>
    </Surface>
  );
}

/**
 * Volleyball scoring as an operator console: one big target per team, the
 * serve follows the rally, Undo names what it reverses, and End Set says what
 * it is about to do before it does it. Setup, corrections, swapping sides and
 * resetting live in the overflow menu, away from the scoring targets.
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
    <section aria-label="Match" className="flex flex-col gap-1">
      <SectionHeader
        label="Match"
        detail={
          final ? (
            <span className="font-semibold text-ok">
              Final · {score[winner].name} wins {sideSets(score, winner)}–
              {sideSets(score, winner === 'home' ? 'away' : 'home')}
            </span>
          ) : (
            <>
              Set {score.setNumber} of {matchSetLimit(score)} · to {setPointTarget(score)}, win by 2
            </>
          )
        }
        actions={<MatchMenu score={score} />}
      />
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
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Hint label={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'} keys={['Z']}>
          <span className="inline-flex max-w-[55%]">
            <Button disabled={!undoLabel} onClick={undoScoreAction} className="max-w-full">
              <Undo2 />
              <span className="truncate">{undoLabel ? `Undo · ${undoLabel}` : 'Undo'}</span>
            </Button>
          </span>
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
                <ActionButton
                  intent="primary"
                  onClick={() => void endSet()}
                  aria-label={`End set ${score.setNumber}`}
                >
                  <Flag />
                  End Set {score.setNumber} · {score[preview.winner].name} {preview.winnerPoints}–
                  {preview.loserPoints}
                  {preview.endsMatch ? ' · Final' : ''}
                </ActionButton>
              ) : (
                <ActionButton
                  intent="quiet"
                  onClick={() => void endSet()}
                  aria-label={`End set ${score.setNumber}`}
                >
                  <Flag />
                  End Set {score.setNumber}…
                </ActionButton>
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
