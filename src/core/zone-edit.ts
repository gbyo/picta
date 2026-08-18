/** Pure draft-session state for the explicit Edit Zones workflow. */

import type { LayoutNode, Scene } from './domain.js';
import { layoutZones } from './layouts.js';
import { cloneScene } from './scenes.js';

export interface ZoneEditSession {
  sceneId: string;
  original: Scene;
  draft: Scene;
  selectedZoneId: string | null;
  showSafeAreas: boolean;
}

export function beginZoneEdit(scene: Scene): ZoneEditSession {
  const original = cloneScene(scene);
  return {
    sceneId: scene.id,
    original,
    draft: cloneScene(scene),
    selectedZoneId: scene.layout.type === 'zone' ? scene.layout.id : null,
    showSafeAreas: true,
  };
}

export function setDraftLayout(session: ZoneEditSession, layout: LayoutNode): ZoneEditSession {
  const ids = new Set(layoutZones(layout).map((zone) => zone.id));
  return {
    ...session,
    draft: { ...cloneScene(session.draft), layout },
    selectedZoneId:
      session.selectedZoneId && ids.has(session.selectedZoneId)
        ? session.selectedZoneId
        : (layoutZones(layout)[0]?.id ?? null),
  };
}

export function selectEditZone(session: ZoneEditSession, zoneId: string | null): ZoneEditSession {
  return { ...session, selectedZoneId: zoneId };
}

export function setEditSafeAreas(
  session: ZoneEditSession,
  showSafeAreas: boolean,
): ZoneEditSession {
  return { ...session, showSafeAreas };
}

export function commitZoneEdit(session: ZoneEditSession): Scene {
  return cloneScene(session.draft);
}

export function cancelZoneEdit(session: ZoneEditSession): Scene {
  return cloneScene(session.original);
}

export function zoneEditChanged(session: ZoneEditSession): boolean {
  return JSON.stringify(session.original) !== JSON.stringify(session.draft);
}
