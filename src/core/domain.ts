/**
 * General Picta domain values.
 *
 * This module deliberately contains data and small value types only.  It does
 * not know about Tauri, the DOM, files on disk, or a particular sport.
 */

export type MediaType = 'image' | 'video';

/** A path to media owned by a team or media set. */
export interface MediaRef {
  path: string;
  /** True when the controller could not find the path during its last check. */
  missing?: boolean;
}

export interface PlayerMedia {
  photo?: MediaRef;
  introVideo?: MediaRef;
}

/** A reusable, sport-neutral player. */
export interface Player {
  id: string;
  number: string;
  name: string;
  position?: string;
  media: PlayerMedia;
  /** Optional per-player override of the sport's board statistics. */
  featuredStats?: string[];
}

export interface PlayerGroup {
  id: string;
  name: string;
  /** Order is meaningful, especially for lineup cues. */
  playerIds: string[];
  maxPlayers?: number;
}

export interface TeamColors {
  primary: string;
  secondary: string;
}

export interface Team {
  version: 1;
  id: string;
  name: string;
  sport: string;
  colors: TeamColors;
  players: Player[];
  groups: PlayerGroup[];
  /** Only present for a portable custom sport. */
  customSport?: import('./sports.js').CustomSportDefinition;
}

export type RawPlayerStats = Record<string, number>;

/** Event-only state.  It is intentionally not part of a reusable Team. */
export interface EventState {
  stats: Record<string, RawPlayerStats>;
  /** Live group overrides such as the current on-court or on-field players. */
  liveGroups: Record<string, string[]>;
}

export interface MediaItem {
  id: string;
  type: MediaType;
  path: string;
  /** Images use this when no item override is provided. Videos ignore it. */
  durationSeconds?: number;
  /** Runtime-only existence marker; never serialized. */
  missing?: boolean;
}

export interface MediaSet {
  version: 1;
  name: string;
  items: MediaItem[];
  transition: 'none' | 'crossfade';
  imageSizing: 'fit' | 'fill';
  imageDurationSeconds: number;
}

export type MediaResource =
  { kind: 'inline'; data: MediaSet } | { kind: 'file'; path: string; data?: MediaSet };

export type TeamResource =
  { kind: 'inline'; data: Team } | { kind: 'file'; path: string; data?: Team };

export type ZoneRole = 'program' | 'live-board' | 'media' | 'blank';

export interface ZoneNode {
  type: 'zone';
  id: string;
  role: ZoneRole;
}

export interface SplitNode {
  type: 'split';
  /** columns means left/right; rows means top/bottom. */
  direction: 'columns' | 'rows';
  /** Share allocated to the first child. */
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
}

export type LayoutNode = ZoneNode | SplitNode;

export interface ShowBackground {
  kind: 'black' | 'primary' | 'secondary';
}

/** A reusable output composition and its live-board/background choices. */
export interface Scene {
  id: string;
  name: string;
  layout: LayoutNode;
  liveBoardGroupId?: string;
  background: ShowBackground;
}

export interface ShowDocument {
  version: 2;
  media: MediaResource;
  team?: TeamResource;
  event: EventState;
  scenes: Scene[];
  defaultSceneId: string;
}

export interface BoardColumn {
  id: string;
  shortLabel: string;
  label?: string;
}

export interface BoardRow {
  playerId: string;
  number: string;
  name: string;
  values: string[];
}

export interface BoardData {
  columns: BoardColumn[];
  rows: BoardRow[];
}

export interface PlayerCardCue {
  type: 'player-card';
  playerId: string;
  target: 'program' | 'full-board';
  holdMs: number;
  number: string;
  name: string;
  position: string;
  photo?: MediaRef;
  stats: { label: string; value: string }[];
}

export interface VideoCue {
  type: 'video';
  target: 'program' | 'full-board';
  path: string;
  playerId?: string;
  label?: string;
}

export interface ImageCue {
  type: 'image';
  target: 'program' | 'full-board';
  path: string;
  holdMs: number;
  label?: string;
}

export interface GroupCue {
  type: 'group';
  target: 'program' | 'full-board';
  groupId: string;
  groupName: string;
  playerIds: string[];
}

export type Cue = PlayerCardCue | VideoCue | ImageCue | GroupCue;
