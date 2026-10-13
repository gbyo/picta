/** Small, stable selectors shared by controller components. */

import { useMemo } from 'react';
import type { MediaItem, Screen } from '@core/domain.js';
import { findById } from '@core/monitors.js';
import {
  armedScreen,
  boardDataFor,
  boardGroupFor,
  definitionOf,
  mediaSetOf,
  scoreOf,
  screenById,
} from './state/derive';
import { usePicta } from './state/store';
import type { ScreenRenderProps } from './components/picta/screen-render';

export function useShowData() {
  return usePicta((state) => state.doc.show.data);
}

export function useMediaSet() {
  const data = useShowData();
  const style = usePicta((state) => state.pathStyle);
  return useMemo(() => mediaSetOf(data, style), [data, style]);
}

export function useTeam() {
  return usePicta((state) => state.doc.show.data.team?.data);
}

export function useDefinition() {
  const team = useTeam();
  return useMemo(() => definitionOf(team), [team]);
}

export function useScore() {
  const data = useShowData();
  return useMemo(() => scoreOf(data), [data]);
}

export function useLive(): boolean {
  return usePicta((state) => state.output.phase === 'live');
}

export function useProgramScreen(): Screen {
  return usePicta(
    (state) => screenById(state.doc.show.data, state.output.liveScreenId) ?? armedScreen(state),
  );
}

export function useDisplayAspect(): number {
  return usePicta((state) => {
    const display = findById(state.displays, state.selectedDisplayId);
    return display && display.height > 0 ? display.width / display.height : 16 / 9;
  });
}

export function backgroundColor(
  screen: Screen,
  colors?: { primary: string; secondary: string },
): string {
  if (screen.background.kind === 'primary') return colors?.primary ?? '#111111';
  if (screen.background.kind === 'secondary') return colors?.secondary ?? '#ffffff';
  return '#000000';
}

/** Everything ScreenRender needs to draw `screen` with tonight's data. */
export function useScreenContent(
  screen: Screen,
  mediaItem: MediaItem | null,
): Pick<ScreenRenderProps, 'score' | 'board' | 'boardGroupName' | 'media' | 'background'> {
  const data = useShowData();
  const set = useMediaSet();
  return useMemo(() => {
    const team = data.team?.data;
    return {
      score: scoreOf(data),
      board: boardDataFor(data, screen),
      boardGroupName: boardGroupFor(screen, team)?.name,
      media: { item: mediaItem, sizing: set.imageSizing },
      background: backgroundColor(screen, team?.colors),
    };
  }, [data, screen, mediaItem, set.imageSizing]);
}

/** The rotation item on the program now, or the first playable one off air. */
export function useProgramMediaItem(): MediaItem | null {
  const set = useMediaSet();
  const live = usePicta((state) => state.output.phase === 'live');
  const itemId = usePicta((state) => state.output.media.itemId);
  return useMemo(() => {
    if (live) return set.items.find((item) => item.id === itemId) ?? null;
    return set.items.find((item) => !item.missing) ?? set.items[0] ?? null;
  }, [set, live, itemId]);
}
