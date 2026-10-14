import { ChevronLeft, ChevronRight, Film, Image, Square, UserRound } from 'lucide-react';
import type { Cue } from '@core/domain.js';
import { Surface } from '@cladd-ui/react';
import { ActionButton, IconButton } from '@/components/picta/controls';
import { Hint } from '@/components/picta/hint';
import { usePicta, usePictaShallow } from '@/state/store';
import { endCue, nextCue, previousCue, playerLabel } from '@/actions/cues';
import { useNow } from '@/use-now';

function cueTitle(cue: Cue): string {
  switch (cue.type) {
    case 'player-card':
      return playerLabel(cue);
    case 'video':
      return cue.label ?? 'Video';
    case 'image':
      return cue.label ?? 'Image';
    case 'group':
      return cue.groupName;
  }
}

function cueKind(cue: Cue): string {
  switch (cue.type) {
    case 'player-card':
      return 'Player card';
    case 'video':
      return cue.playerId ? 'Intro video' : 'Video';
    case 'image':
      return 'Image';
    case 'group':
      return 'Group';
  }
}

function CueProgress({ since, holdMs }: { since: number; holdMs: number }) {
  const now = useNow(200);
  const progress = Math.min(1, (now - since) / Math.max(250, holdMs));
  return (
    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-cue/20">
      <div className="h-full bg-cue" style={{ width: `${progress * 100}%` }} />
    </div>
  );
}

/**
 * A cue temporarily takes over the program. This strip says exactly what is
 * on air instead of the rotation, how far through it is, and how to end it.
 */
export function CueStrip() {
  const { state, context, since } = usePictaShallow((s) => ({
    state: s.output.cue.state,
    context: s.output.cue.context,
    since: s.output.cue.since,
  }));
  const live = usePicta((s) => s.output.phase === 'live');
  const cue = state.current;
  if (!live || !state.active || !cue) return null;
  const ordered = context?.kind === 'ordered-group';
  const Icon =
    cue.type === 'player-card'
      ? UserRound
      : cue.type === 'video'
        ? Film
        : cue.type === 'image'
          ? Image
          : UserRound;
  const holdMs = cue.type === 'player-card' || cue.type === 'image' ? cue.holdMs : null;
  const target = cue.target === 'full-board' ? 'Full screen' : 'Media panel';

  return (
    <Surface
      as="section"
      aria-label="Cue on air"
      aria-live="polite"
      color="cue"
      variant="solid"
      outline
      level={2}
      className="shrink-0 overflow-hidden rounded-cladd-md"
      contentClassName="flex items-center gap-2.5 px-2.5 py-2"
    >
      <Icon className="size-4 shrink-0 text-cue" />
      <div className="min-w-0 flex-1">
        <p className="text-cladd-2xs font-bold tracking-wider text-cue">
          CUE · {cueKind(cue).toUpperCase()} · {target.toUpperCase()}
        </p>
        <p className="truncate text-cladd-xs font-semibold">
          {cueTitle(cue)}
          {ordered && (
            <span className="ml-1.5 font-normal text-cladd-fg-soft tabular">
              {context.label} {state.index + 1}/{state.total}
            </span>
          )}
        </p>
      </div>
      {ordered && (
        <>
          <IconButton
            label="Previous in lineup"
            size="sm"
            disabled={state.index <= 0}
            onClick={previousCue}
          >
            <ChevronLeft />
          </IconButton>
          <IconButton label="Skip to next in lineup" size="sm" onClick={nextCue}>
            <ChevronRight />
          </IconButton>
        </>
      )}
      <Hint label="End the cue and return to the rotation. Output stays live." keys={['Esc']}>
        <ActionButton intent="cue" size="sm" onClick={endCue}>
          <Square className="size-2.5 fill-current" />
          {ordered ? 'End Lineup' : context?.kind === 'single-player' ? 'End Player' : 'End Cue'}
        </ActionButton>
      </Hint>
      {holdMs !== null ? (
        <CueProgress since={since} holdMs={holdMs} />
      ) : (
        <div className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-cue/60" />
      )}
    </Surface>
  );
}
