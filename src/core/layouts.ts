/** Resolution-independent recursive tiling layouts. */

import type { LayoutNode, ZoneNode, ZoneRole } from './domain.js';

export const MIN_SPLIT_RATIO = 0.1;
export const MAX_SPLIT_RATIO = 0.9;
export const MAX_LAYOUT_ZONES = 4;

export interface ZoneRect {
  id: string;
  role: ZoneRole;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayoutValidationError =
  | 'not-an-object'
  | 'invalid-zone'
  | 'duplicate-zone-id'
  | 'invalid-split'
  | 'invalid-ratio'
  | 'too-many-zones'
  | 'program-zone-count';

export type LayoutValidationResult =
  | {
      ok: true;
      zoneCount: number;
      programCount: number;
    }
  | {
      ok: false;
      kind: LayoutValidationError;
      message: string;
    };

const zone = (id: string, role: ZoneRole): ZoneNode => ({ type: 'zone', id, role });

export const FULL_LAYOUT: LayoutNode = zone('program', 'program');

export const HALF_HALF_LAYOUT: LayoutNode = {
  type: 'split',
  direction: 'columns',
  ratio: 0.5,
  first: zone('program', 'program'),
  second: zone('live-board', 'live-board'),
};

export const PROGRAM_TWO_THIRDS_LAYOUT: LayoutNode = {
  type: 'split',
  direction: 'columns',
  ratio: 2 / 3,
  first: zone('program', 'program'),
  second: zone('live-board', 'live-board'),
};

export const BOARD_TWO_THIRDS_LAYOUT: LayoutNode = {
  type: 'split',
  direction: 'columns',
  ratio: 1 / 3,
  first: zone('live-board', 'live-board'),
  second: zone('program', 'program'),
};

export type LayoutPresetId = 'full' | 'half-half' | 'program-2-3' | 'board-1-3' | 'custom';

export function layoutPreset(id: Exclude<LayoutPresetId, 'custom'>): LayoutNode {
  switch (id) {
    case 'half-half':
      return cloneLayout(HALF_HALF_LAYOUT);
    case 'program-2-3':
      return cloneLayout(PROGRAM_TWO_THIRDS_LAYOUT);
    case 'board-1-3':
      return cloneLayout(BOARD_TWO_THIRDS_LAYOUT);
    case 'full':
      return cloneLayout(FULL_LAYOUT);
  }
}

export function cloneLayout(layout: LayoutNode): LayoutNode {
  return layout.type === 'zone'
    ? { ...layout }
    : {
        ...layout,
        first: cloneLayout(layout.first),
        second: cloneLayout(layout.second),
      };
}

function invalid(kind: LayoutValidationError, message: string): LayoutValidationResult {
  return { ok: false, kind, message };
}

export function validateLayout(layout: unknown): LayoutValidationResult {
  const ids = new Set<string>();
  let zones = 0;
  let programs = 0;

  const walk = (node: unknown): LayoutValidationResult | null => {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) {
      return invalid('not-an-object', 'Every layout node must be an object.');
    }
    const value = node as Record<string, unknown>;
    if (value['type'] === 'zone') {
      if (typeof value['id'] !== 'string' || value['id'].trim() === '') {
        return invalid('invalid-zone', 'Every layout zone needs an id.');
      }
      if (!['program', 'live-board', 'media', 'blank'].includes(String(value['role']))) {
        return invalid('invalid-zone', `Zone "${value['id']}" has an invalid role.`);
      }
      if (ids.has(value['id']))
        return invalid('duplicate-zone-id', `Layout zone id "${value['id']}" is duplicated.`);
      ids.add(value['id']);
      zones += 1;
      if (value['role'] === 'program') programs += 1;
      if (zones > MAX_LAYOUT_ZONES)
        return invalid('too-many-zones', `Layouts may contain at most ${MAX_LAYOUT_ZONES} zones.`);
      return null;
    }
    if (value['type'] !== 'split')
      return invalid('invalid-split', 'A layout node must be a zone or split.');
    if (value['direction'] !== 'columns' && value['direction'] !== 'rows') {
      return invalid('invalid-split', 'A split direction must be columns or rows.');
    }
    if (typeof value['ratio'] !== 'number' || !Number.isFinite(value['ratio'])) {
      return invalid('invalid-ratio', 'A split ratio must be a finite number.');
    }
    if (value['ratio'] < MIN_SPLIT_RATIO || value['ratio'] > MAX_SPLIT_RATIO) {
      return invalid(
        'invalid-ratio',
        `Split ratios must be between ${MIN_SPLIT_RATIO} and ${MAX_SPLIT_RATIO}.`,
      );
    }
    if (!('first' in value) || !('second' in value))
      return invalid('invalid-split', 'A split needs two child nodes.');
    return walk(value['first']) ?? walk(value['second']);
  };

  const error = walk(layout);
  if (error) return error;
  if (programs !== 1)
    return invalid('program-zone-count', 'A layout must contain exactly one Program zone.');
  return { ok: true, zoneCount: zones, programCount: programs };
}

export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, ratio));
}

/**
 * Resolve a layout into integer rectangles.  The second child always starts
 * at the first child's rounded edge, so adjacent children share an edge and
 * their sizes sum exactly to the parent even at odd resolutions.
 */
export function resolveZoneRects(
  layout: LayoutNode,
  outputWidth: number,
  outputHeight: number,
): ZoneRect[] {
  const width = Math.max(0, Math.floor(outputWidth));
  const height = Math.max(0, Math.floor(outputHeight));
  const out: ZoneRect[] = [];

  const walk = (
    node: LayoutNode,
    x: number,
    y: number,
    nodeWidth: number,
    nodeHeight: number,
  ): void => {
    if (node.type === 'zone') {
      out.push({ id: node.id, role: node.role, x, y, width: nodeWidth, height: nodeHeight });
      return;
    }
    const ratio = clampRatio(node.ratio);
    if (node.direction === 'columns') {
      const firstWidth = Math.round(nodeWidth * ratio);
      const secondWidth = nodeWidth - firstWidth;
      walk(node.first, x, y, firstWidth, nodeHeight);
      walk(node.second, x + firstWidth, y, secondWidth, nodeHeight);
    } else {
      const firstHeight = Math.round(nodeHeight * ratio);
      const secondHeight = nodeHeight - firstHeight;
      walk(node.first, x, y, nodeWidth, firstHeight);
      walk(node.second, x, y + firstHeight, nodeWidth, secondHeight);
    }
  };

  walk(layout, 0, 0, width, height);
  return out;
}

export function legacyLayoutToTree(layout: 'full' | 'split'): LayoutNode {
  return layout === 'split' ? cloneLayout(HALF_HALF_LAYOUT) : cloneLayout(FULL_LAYOUT);
}

export function layoutPresetLabel(id: LayoutPresetId): string {
  switch (id) {
    case 'full':
      return 'Full';
    case 'half-half':
      return 'Half + Half';
    case 'program-2-3':
      return 'Program 2/3 + Board 1/3';
    case 'board-1-3':
      return 'Board 1/3 + Program 2/3';
    case 'custom':
      return 'Custom…';
  }
}

export function layoutPresetId(layout: LayoutNode): LayoutPresetId {
  const serialized = JSON.stringify(layout);
  if (serialized === JSON.stringify(FULL_LAYOUT)) return 'full';
  if (serialized === JSON.stringify(HALF_HALF_LAYOUT)) return 'half-half';
  if (serialized === JSON.stringify(PROGRAM_TWO_THIRDS_LAYOUT)) return 'program-2-3';
  if (serialized === JSON.stringify(BOARD_TWO_THIRDS_LAYOUT)) return 'board-1-3';
  return 'custom';
}

function containsZone(node: LayoutNode, zoneId: string): boolean {
  return node.type === 'zone'
    ? node.id === zoneId
    : containsZone(node.first, zoneId) || containsZone(node.second, zoneId);
}

/** Return a new tree with one selected zone split into two tiled zones. */
export function splitZone(
  layout: LayoutNode,
  zoneId: string,
  direction: 'columns' | 'rows',
  secondRole: ZoneRole = 'blank',
  secondId = `${zoneId}-secondary`,
): LayoutNode {
  if (layout.type === 'zone') {
    if (layout.id !== zoneId) return { ...layout };
    return {
      type: 'split',
      direction,
      ratio: 0.5,
      first: { ...layout },
      second: { id: secondId, role: secondRole, type: 'zone' },
    };
  }
  return {
    ...layout,
    first: containsZone(layout.first, zoneId)
      ? splitZone(layout.first, zoneId, direction, secondRole, secondId)
      : cloneLayout(layout.first),
    second: containsZone(layout.second, zoneId)
      ? splitZone(layout.second, zoneId, direction, secondRole, secondId)
      : cloneLayout(layout.second),
  };
}

export function setZoneRole(layout: LayoutNode, zoneId: string, role: ZoneRole): LayoutNode {
  if (layout.type === 'zone') return layout.id === zoneId ? { ...layout, role } : { ...layout };
  return {
    ...layout,
    first: setZoneRole(layout.first, zoneId, role),
    second: setZoneRole(layout.second, zoneId, role),
  };
}

/** Remove the split containing a selected zone, keeping its sibling. */
export function mergeZone(layout: LayoutNode, zoneId: string): LayoutNode {
  if (layout.type === 'zone') return { ...layout };
  if (layout.first.type === 'zone' && layout.first.id === zoneId) return cloneLayout(layout.second);
  if (layout.second.type === 'zone' && layout.second.id === zoneId)
    return cloneLayout(layout.first);
  return {
    ...layout,
    first: mergeZone(layout.first, zoneId),
    second: mergeZone(layout.second, zoneId),
  };
}

export type LayoutPathPart = 'first' | 'second';

export function updateSplitRatioAtPath(
  layout: LayoutNode,
  path: readonly LayoutPathPart[],
  ratio: number,
): LayoutNode {
  if (layout.type === 'zone') return { ...layout };
  if (path.length === 0) return { ...layout, ratio: clampRatio(ratio) };
  const [part, ...rest] = path;
  return part === 'first'
    ? { ...layout, first: updateSplitRatioAtPath(layout.first, rest, ratio) }
    : { ...layout, second: updateSplitRatioAtPath(layout.second, rest, ratio) };
}

export function layoutZones(layout: LayoutNode): ZoneNode[] {
  if (layout.type === 'zone') return [{ ...layout }];
  return [...layoutZones(layout.first), ...layoutZones(layout.second)];
}

export function updateFirstMatchingSplitRatio(
  layout: LayoutNode,
  zoneId: string,
  ratio: number,
): LayoutNode {
  if (layout.type === 'zone') return { ...layout };
  if (containsZone(layout.first, zoneId) || containsZone(layout.second, zoneId)) {
    return { ...layout, ratio: clampRatio(ratio) };
  }
  return {
    ...layout,
    first: updateFirstMatchingSplitRatio(layout.first, zoneId, ratio),
    second: updateFirstMatchingSplitRatio(layout.second, zoneId, ratio),
  };
}
