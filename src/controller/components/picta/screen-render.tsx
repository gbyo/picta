import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Film, ImageOff, UserRound } from 'lucide-react';
import type {
  BoardData,
  Cue,
  MediaItem,
  Screen,
  ScreenPanel,
  VolleyballScoreState,
} from '@core/domain.js';
import { safeAreaForRect } from '@core/layouts.js';
import { renderScoreboard } from '@app/scoreboard-ui.js';
import { cn } from '@/lib/utils';
import { rt } from '@/runtime';
import { CONTENT_META } from './content-meta';

/**
 * The same score markup the audience display renders (see scoreboard-ui.ts),
 * so the operator preview can never disagree with the TV about the score.
 */
export function ScoreboardView({ score }: { score: VolleyballScoreState }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (host.current) renderScoreboard(host.current, score);
  }, [score]);
  return <div ref={host} className="scoreboard-shell" aria-hidden />;
}

export function BoardView({ board, groupName }: { board: BoardData; groupName?: string }) {
  if (board.rows.length === 0)
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black text-[3.2cqmin] text-white/45">
        {groupName ? `${groupName} is empty` : 'Stats needs a team'}
      </div>
    );
  return (
    <div className="absolute inset-0 flex flex-col justify-center bg-black px-[4cqw] py-[4cqh] font-bold text-white">
      <table className="w-full border-collapse text-[min(4.4cqw,6cqh)] leading-tight tabular">
        <thead>
          <tr className="text-white/55">
            <th />
            <th />
            {board.columns.map((column) => (
              <th key={column.id} className="pb-[1cqh] text-right font-semibold">
                {column.shortLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row) => (
            <tr key={row.playerId} className="border-t border-white/10">
              <td className="w-[1%] py-[0.8cqh] pr-[2cqw] whitespace-nowrap text-white/60">
                {row.number}
              </td>
              <td className="max-w-0 truncate py-[0.8cqh] uppercase">{row.name}</td>
              {row.values.map((value, index) => (
                <td key={index} className="w-[11%] py-[0.8cqh] text-right">
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface MediaPreview {
  item: MediaItem | null;
  sizing: 'fit' | 'fill';
  /** Optional caption, e.g. "3 of 12". */
  caption?: string;
}

function MediaView({ media }: { media: MediaPreview }) {
  const item = media.item;
  if (!item)
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black text-[3cqmin] text-white/35">
        No media
      </div>
    );
  if (item.missing)
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2cqh] bg-black text-[3cqmin] text-white/45">
        <ImageOff className="size-[12cqmin]" />
        Missing file
      </div>
    );
  const src = rt().platform.assetUrl(item.path);
  const fit = media.sizing === 'fill' ? 'object-cover' : 'object-contain';
  return item.type === 'image' ? (
    <img src={src} alt="" draggable={false} className={cn('absolute inset-0 size-full', fit)} />
  ) : (
    <>
      <video
        src={`${src}#t=0.5`}
        muted
        playsInline
        preload="metadata"
        className={cn('absolute inset-0 size-full', fit)}
      />
      <span className="absolute top-[3cqh] left-[3cqw] flex items-center gap-[1cqw] rounded-[0.6cqmin] bg-black/70 px-[1.4cqw] py-[0.6cqh] text-[2.6cqmin] font-semibold text-white">
        <Film className="size-[3cqmin]" />
        VIDEO
      </span>
    </>
  );
}

function CueView({ cue, photoPath }: { cue: Cue; photoPath?: string | undefined }) {
  if (cue.type === 'player-card')
    return (
      <div className="absolute inset-0 flex items-center gap-[4cqw] bg-[var(--cue-card,#101217)] p-[6cqmin] text-white">
        <div className="flex aspect-[3/4] h-[78%] items-center justify-center overflow-hidden rounded-[1cqmin] bg-white/10">
          {photoPath ? (
            <img
              src={rt().platform.assetUrl(photoPath)}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <UserRound className="size-1/2 text-white/40" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[9cqmin] leading-none font-black text-white/50">
            {cue.number ? `#${cue.number}` : ''}
          </div>
          <div className="truncate text-[7cqmin] leading-tight font-black uppercase">
            {cue.name}
          </div>
          <div className="text-[3.6cqmin] text-white/60 uppercase">{cue.position}</div>
          <div className="mt-[2cqh] flex gap-[3cqw]">
            {cue.stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-[6cqmin] leading-none font-black">{stat.value}</div>
                <div className="text-[2.4cqmin] text-white/55 uppercase">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  if (cue.type === 'image')
    return (
      <img
        src={rt().platform.assetUrl(cue.path)}
        alt=""
        className="absolute inset-0 size-full bg-black object-contain"
      />
    );
  if (cue.type === 'video')
    return (
      <div className="absolute inset-0 bg-black">
        <video
          src={`${rt().platform.assetUrl(cue.path)}#t=0.5`}
          muted
          preload="metadata"
          className="absolute inset-0 size-full object-contain"
        />
        <span className="absolute inset-x-0 bottom-[6cqh] text-center text-[4cqmin] font-bold text-white uppercase drop-shadow">
          {cue.label ?? 'Video'}
        </span>
      </div>
    );
  return null;
}

export interface ScreenRenderProps {
  screen: Screen;
  /** Output width / height. */
  aspect: number;
  score: VolleyballScoreState;
  board: BoardData;
  boardGroupName?: string | undefined;
  media: MediaPreview;
  background: string;
  cue?: Cue | null;
  cuePanelId?: string | undefined;
  selectedPanelId?: string | null;
  onSelectPanel?: ((panelId: string) => void) | undefined;
  showSafeArea?: boolean;
  /** Panel labels for the editor ("Left · Media"). */
  panelLabel?: ((panel: ScreenPanel, index: number) => ReactNode) | undefined;
  className?: string;
}

/**
 * A faithful miniature of the audience display, built from the same Screen
 * geometry and the same score renderer as the output.
 */
export function ScreenRender({
  screen,
  aspect,
  score,
  board,
  boardGroupName,
  media,
  background,
  cue,
  cuePanelId,
  selectedPanelId,
  onSelectPanel,
  showSafeArea,
  panelLabel,
  className,
}: ScreenRenderProps) {
  const fullCue = cue && cue.target === 'full-board';
  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={{ aspectRatio: String(aspect), background }}
    >
      {screen.panels.map((panel, index) => {
        const selected = selectedPanelId === panel.id;
        const interactive = Boolean(onSelectPanel);
        const meta = CONTENT_META[panel.content.kind];
        const showCue = cue && !fullCue && panel.id === cuePanelId;
        const body = (
          <>
            {panel.content.kind === 'media' && <MediaView media={media} />}
            {panel.content.kind === 'score' && <ScoreboardView score={score} />}
            {panel.content.kind === 'stats' && (
              <BoardView board={board} {...(boardGroupName ? { groupName: boardGroupName } : {})} />
            )}
            {showCue && (
              <CueView
                cue={cue}
                photoPath={cue.type === 'player-card' ? cue.photo?.path : undefined}
              />
            )}
            {showSafeArea && <SafeArea aspect={aspect} rect={panel.rect} />}
            {panelLabel && (
              <span className="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-1 rounded-[3px] bg-black/75 px-1.5 py-0.5 text-[10.5px] font-medium text-white">
                <meta.icon className="size-3" />
                {panelLabel(panel, index)}
              </span>
            )}
            {interactive && (
              <span
                className={cn(
                  'pointer-events-none absolute inset-0 transition-shadow',
                  selected
                    ? 'shadow-[inset_0_0_0_2px_var(--accent)]'
                    : 'group-hover/panel:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.45)]',
                )}
              />
            )}
          </>
        );
        const style = {
          left: `${panel.rect.x * 100}%`,
          top: `${panel.rect.y * 100}%`,
          width: `${panel.rect.width * 100}%`,
          height: `${panel.rect.height * 100}%`,
        };
        return interactive ? (
          <button
            key={panel.id}
            type="button"
            aria-pressed={selected}
            aria-label={`${panelLabel ? '' : ''}Panel ${index + 1}: ${meta.label}`}
            onClick={() => onSelectPanel?.(panel.id)}
            className="monitor-panel group/panel absolute overflow-hidden text-left outline-none focus-visible:z-10 focus-visible:shadow-[inset_0_0_0_2px_var(--accent)]"
            style={style}
          >
            {body}
          </button>
        ) : (
          <div key={panel.id} className="monitor-panel absolute overflow-hidden" style={style}>
            {body}
          </div>
        );
      })}
      {fullCue && (
        <div className="monitor-panel absolute inset-0">
          <CueView cue={cue} photoPath={cue.type === 'player-card' ? cue.photo?.path : undefined} />
        </div>
      )}
    </div>
  );
}

function SafeArea({ aspect, rect }: { aspect: number; rect: ScreenPanel['rect'] }) {
  // Compute against a nominal 1000-unit tall canvas so the inset matches the
  // output's per-panel safe area in proportion.
  const height = 1000;
  const width = height * aspect;
  const zone = {
    id: 'safe',
    role: 'blank' as const,
    x: 0,
    y: 0,
    width: rect.width * width,
    height: rect.height * height,
  };
  const safe = safeAreaForRect(zone);
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute border border-dashed border-warn/80"
      style={{
        left: `${(safe.x / zone.width) * 100}%`,
        top: `${(safe.y / zone.height) * 100}%`,
        width: `${(safe.width / zone.width) * 100}%`,
        height: `${(safe.height / zone.height) * 100}%`,
      }}
    />
  );
}
