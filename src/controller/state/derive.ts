/**
 * Pure derivations from controller state. Everything the UI and the output
 * bridge need to agree on — which board a Screen shows, where cues land, what
 * Go Live is waiting for — is computed here, once.
 */

import type {
  BoardData,
  MediaItem,
  MediaSet,
  PlayerGroup,
  Screen,
  ScreenPanel,
  ShowDocument,
  Team,
} from '@core/domain.js';
import { defaultMediaSet } from '@core/media.js';
import { basename, type PathStyle } from '@core/paths.js';
import { formatBoardData, sportDefinition, type SportDefinition } from '@core/sports.js';
import { defaultVolleyballScore } from '@core/score.js';
import { describeDisplay, findById, type DisplayInfo } from '@core/monitors.js';
import type { ThemeMessage } from '@app/events.js';
import type { DocumentState, PictaState } from './store.js';

export function mediaSetOf(data: ShowDocument, style: PathStyle = 'posix'): MediaSet {
  const resource = data.media;
  return (
    resource.data ??
    defaultMediaSet(resource.kind === 'file' ? basename(resource.path, style) : 'Inline Media')
  );
}

export function teamOf(data: ShowDocument): Team | undefined {
  return data.team?.data;
}

export function definitionOf(team: Team | undefined): SportDefinition | null {
  return team ? sportDefinition(team.sport, team.customSport) : null;
}

export function screenById(data: ShowDocument, id: string | null | undefined): Screen | undefined {
  return id ? data.screens.find((screen) => screen.id === id) : undefined;
}

/** The Screen Go Live would use, falling back to the default Screen. */
export function armedScreen(state: Pick<PictaState, 'doc' | 'armedScreenId'>): Screen {
  const data = state.doc.show.data;
  return (
    screenById(data, state.armedScreenId) ??
    screenById(data, data.defaultScreenId) ??
    data.screens[0]!
  );
}

/** What the audience sees now, or what will go live when off air. */
export function programScreen(state: Pick<PictaState, 'doc' | 'armedScreenId' | 'output'>): Screen {
  const live = screenById(state.doc.show.data, state.output.liveScreenId);
  return live ?? armedScreen(state);
}

export function mediaPanel(screen: Screen): ScreenPanel | undefined {
  return screen.panels.find((panel) => panel.content.kind === 'media');
}

export function statsPanel(screen: Screen): ScreenPanel | undefined {
  return screen.panels.find((panel) => panel.content.kind === 'stats');
}

/** Cues land in the Screen's cue panel, or cover the whole display when it has none. */
export function cueTargetFor(screen: Screen): 'program' | 'full-board' {
  const target = screen.cueTargetPanelId
    ? screen.panels.find((panel) => panel.id === screen.cueTargetPanelId)
    : undefined;
  return target ? 'program' : 'full-board';
}

export function describeCueTarget(screen: Screen): string {
  if (cueTargetFor(screen) === 'full-board') return 'Full screen';
  const index = screen.panels.findIndex((panel) => panel.id === screen.cueTargetPanelId);
  return `${panelPlace(screen, index)} panel`;
}

/** Human position of a panel: Left, Right, Top, Bottom, or Full. */
export function panelPlace(screen: Screen, index: number): string {
  const panel = screen.panels[index];
  if (!panel) return 'Panel';
  if (screen.panels.length === 1) return 'Full';
  const { x, y, width, height } = panel.rect;
  if (height >= 0.999 && x < 0.001) return 'Left';
  if (height >= 0.999 && x + width > 0.999) return 'Right';
  if (width >= 0.999 && y < 0.001) return 'Top';
  if (width >= 0.999 && y + height > 0.999) return 'Bottom';
  return `Panel ${index + 1}`;
}

/** The group a stats panel draws, honouring its saved choice when it still exists. */
export function boardGroupFor(
  screen: Screen | undefined,
  team: Team | undefined,
): PlayerGroup | undefined {
  if (!team) return undefined;
  const panel = screen ? statsPanel(screen) : undefined;
  const requested = panel?.content.kind === 'stats' ? panel.content.groupId : undefined;
  return team.groups.find((group) => group.id === requested) ?? defaultLiveGroup(team);
}

/** The sport's "who is playing now" group, else the first group. */
export function defaultLiveGroup(team: Team): PlayerGroup | undefined {
  const preferred = ['on-court', 'on-field', 'defense'];
  for (const id of preferred) {
    const group = team.groups.find((item) => item.id === id);
    if (group) return group;
  }
  return team.groups[0];
}

/** Effective membership of a group, honouring tonight's live override. */
export function effectiveGroupIds(data: ShowDocument, group: PlayerGroup): string[] {
  return data.event.liveGroups[group.id] ?? group.playerIds;
}

export function boardDataFor(data: ShowDocument, screen: Screen | undefined): BoardData {
  const team = teamOf(data);
  const definition = definitionOf(team);
  const group = boardGroupFor(screen, team);
  if (!team || !definition || !group) return { columns: [], rows: [] };
  const effective = { ...group, playerIds: effectiveGroupIds(data, group) };
  return formatBoardData(team.players, effective, definition, data.event.stats);
}

function contrastColor(color: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return '#ffffff';
  const value = Number.parseInt(match[1] ?? 'ffffff', 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return red * 0.299 + green * 0.587 + blue * 0.114 > 150 ? '#111111' : '#ffffff';
}

export function outputThemeFor(data: ShowDocument, screen: Screen): ThemeMessage {
  const colors = teamOf(data)?.colors ?? { primary: '#111111', secondary: '#ffffff' };
  const background = screen.background.kind;
  return {
    primary: colors.primary,
    secondary: colors.secondary,
    foreground: contrastColor(background === 'secondary' ? colors.secondary : colors.primary),
    background,
  };
}

export function scoreOf(data: ShowDocument) {
  return data.event.score ?? defaultVolleyballScore(teamOf(data));
}

/** Volleyball scoring is relevant when a Screen shows it or the team plays volleyball. */
export function scoreInUse(data: ShowDocument): boolean {
  if (data.screens.some((screen) => screen.panels.some((panel) => panel.content.kind === 'score')))
    return true;
  const team = teamOf(data);
  return !team || team.sport === 'volleyball';
}

export function dirtyNames(doc: DocumentState, style: PathStyle): string[] {
  const showName = doc.show.filePath ? basename(doc.show.filePath, style) : 'Untitled.picta';
  // Inline media and teams are written as part of the show file.
  const inlineDirty =
    (doc.mediaDirty && !doc.mediaFilePath) || (doc.teamDirty && !doc.teamFilePath);
  const names: string[] = [];
  if (doc.show.dirty || inlineDirty) names.push(showName);
  if (doc.mediaDirty && doc.mediaFilePath) names.push(basename(doc.mediaFilePath, style));
  if (doc.teamDirty && doc.teamFilePath) names.push(basename(doc.teamFilePath, style));
  return names;
}

export function showTitle(doc: DocumentState, style: PathStyle): string {
  return doc.show.filePath
    ? basename(doc.show.filePath, style).replace(/\.picta$/i, '')
    : 'Untitled Show';
}

export function anyDirty(doc: DocumentState): boolean {
  return doc.show.dirty || doc.mediaDirty || doc.teamDirty;
}

export function selectedDisplay(
  state: Pick<PictaState, 'displays' | 'selectedDisplayId'>,
): DisplayInfo | null {
  return findById(state.displays, state.selectedDisplayId);
}

export function displayDescription(display: DisplayInfo): string {
  return describeDisplay(display);
}

export type ReadinessLevel = 'ok' | 'warn' | 'block' | 'info';

export interface ReadinessItem {
  id: 'display' | 'media' | 'team' | 'screen';
  level: ReadinessLevel;
  label: string;
  detail: string;
}

/** What stands between the operator and a clean Go Live. */
export type ReadinessInputs = Pick<
  PictaState,
  | 'doc'
  | 'armedScreenId'
  | 'displays'
  | 'selectedDisplayId'
  | 'controllerDisplayId'
  | 'displayAmbiguous'
  | 'preflight'
  | 'pathStyle'
>;

export function readiness(state: ReadinessInputs): ReadinessItem[] {
  const data = state.doc.show.data;
  const screen = armedScreen(state);
  const display = selectedDisplay(state);
  const items: ReadinessItem[] = [];
  if (!display)
    items.push({
      id: 'display',
      level: 'block',
      label: 'No display chosen',
      detail: state.displayAmbiguous
        ? 'Two identical displays are connected. Choose one.'
        : 'Choose where the audience output goes.',
    });
  else if (display.id === state.controllerDisplayId)
    items.push({
      id: 'display',
      level: 'warn',
      label: `Display ${display.index} is this screen`,
      detail: 'The output will cover the controller window.',
    });
  else
    items.push({
      id: 'display',
      level: 'ok',
      label: `Display ${display.index}`,
      detail: describeDisplay(display),
    });

  const media = mediaSetOf(data, state.pathStyle);
  const usesMedia = Boolean(mediaPanel(screen));
  const missing = media.items.filter((item) => item.missing).length;
  const failed =
    state.preflight.result?.total === media.items.length ? state.preflight.result.failed.length : 0;
  if (!usesMedia) {
    items.push({
      id: 'media',
      level: 'info',
      label: 'No media panel',
      detail: `${screen.name} has no media.`,
    });
  } else if (media.items.length === 0) {
    items.push({
      id: 'media',
      level: 'warn',
      label: 'No media',
      detail: 'The media panel will be black.',
    });
  } else if (missing + failed > 0) {
    const playable = media.items.length - missing - failed;
    items.push({
      id: 'media',
      level: playable > 0 ? 'warn' : 'block',
      label: `${playable} of ${media.items.length} media playable`,
      detail: `${missing ? `${missing} missing` : ''}${missing && failed ? ' · ' : ''}${failed ? `${failed} can't play` : ''}. They will be skipped.`,
    });
  } else {
    items.push({
      id: 'media',
      level: 'ok',
      label: `${media.items.length} media item${media.items.length === 1 ? '' : 's'}`,
      detail: state.preflight.result ? 'Checked and playable.' : 'Checked when output starts.',
    });
  }

  const usesStats = Boolean(statsPanel(screen));
  const team = teamOf(data);
  if (usesStats) {
    const group = boardGroupFor(screen, team);
    items.push(
      team && group
        ? { id: 'team', level: 'ok', label: team.name, detail: `Stats shows ${group.name}.` }
        : {
            id: 'team',
            level: 'warn',
            label: 'Stats needs a team',
            detail: 'The stats panel will be empty.',
          },
    );
  }
  return items;
}

export function itemLabel(item: MediaItem, style: PathStyle): string {
  return basename(item.path, style);
}
