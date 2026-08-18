/** Pure scene validation and immutable scene operations. */

import type { LayoutNode, Scene, ShowBackground, Team } from './domain.js';
import { cloneLayout, layoutPreset, validateLayout } from './layouts.js';

export type SceneValidationError =
  | 'not-an-array'
  | 'empty'
  | 'invalid-scene'
  | 'duplicate-id'
  | 'duplicate-name'
  | 'invalid-layout'
  | 'invalid-background'
  | 'missing-default'
  | 'missing-group';

export type SceneValidationResult =
  | { ok: true; scenes: Scene[]; defaultSceneId: string }
  | { ok: false; kind: SceneValidationError; message: string };

export interface SceneSet {
  scenes: Scene[];
  defaultSceneId: string;
}

function validText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    !value.includes('\0') &&
    [...value].every((character) => character >= ' ')
  );
}

function cloneBackground(background: ShowBackground): ShowBackground {
  return { ...background };
}

export function cloneScene(scene: Scene): Scene {
  return {
    ...scene,
    layout: cloneLayout(scene.layout),
    ...(scene.liveBoardGroupId === undefined ? {} : { liveBoardGroupId: scene.liveBoardGroupId }),
    background: cloneBackground(scene.background),
  };
}

export function makeScene(
  name = 'Full Board',
  layout: LayoutNode = layoutPreset('full'),
  id = 'scene-1',
): Scene {
  return {
    id,
    name,
    layout: cloneLayout(layout),
    background: { kind: 'black' },
  };
}

export function defaultSceneSet(): SceneSet {
  const scene = makeScene();
  return { scenes: [scene], defaultSceneId: scene.id };
}

export function sceneById(scenes: readonly Scene[], id: string): Scene | undefined {
  return scenes.find((scene) => scene.id === id);
}

export function sceneNameTaken(scenes: readonly Scene[], name: string, exceptId?: string): boolean {
  const normalized = name.trim().toLocaleLowerCase();
  return scenes.some(
    (scene) => scene.id !== exceptId && scene.name.trim().toLocaleLowerCase() === normalized,
  );
}

export function nextSceneId(scenes: readonly Scene[], name = 'scene'): string {
  const stem =
    name
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'scene';
  const ids = new Set(scenes.map((scene) => scene.id));
  let index = 1;
  let candidate = `${stem}-${index}`;
  while (ids.has(candidate)) {
    index += 1;
    candidate = `${stem}-${index}`;
  }
  return candidate;
}

export function validateScenes(
  scenesValue: unknown,
  defaultSceneIdValue: unknown,
  team?: Team,
): SceneValidationResult {
  if (!Array.isArray(scenesValue))
    return { ok: false, kind: 'not-an-array', message: 'A show must contain a scenes array.' };
  if (scenesValue.length === 0)
    return { ok: false, kind: 'empty', message: 'A show must contain at least one scene.' };
  if (!validText(defaultSceneIdValue))
    return {
      ok: false,
      kind: 'missing-default',
      message: 'A show must name its default scene.',
    };

  const ids = new Set<string>();
  const names = new Set<string>();
  const scenes: Scene[] = [];
  for (const raw of scenesValue) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      return { ok: false, kind: 'invalid-scene', message: 'Every scene must be an object.' };
    const value = raw as Record<string, unknown>;
    const id = value['id'];
    const name = value['name'];
    if (!validText(id) || !validText(name)) {
      return {
        ok: false,
        kind: 'invalid-scene',
        message: 'Every scene needs a non-empty id and name.',
      };
    }
    if (ids.has(id))
      return { ok: false, kind: 'duplicate-id', message: `Scene id "${id}" is duplicated.` };
    const normalizedName = name.trim().toLocaleLowerCase();
    if (names.has(normalizedName))
      return {
        ok: false,
        kind: 'duplicate-name',
        message: `Scene name "${name}" is duplicated.`,
      };
    ids.add(id);
    names.add(normalizedName);

    const layoutCheck = validateLayout(value['layout']);
    if (!layoutCheck.ok)
      return {
        ok: false,
        kind: 'invalid-layout',
        message: `Scene "${name}" has an invalid layout: ${layoutCheck.message}`,
      };
    const background = value['background'];
    if (
      typeof background !== 'object' ||
      background === null ||
      Array.isArray(background) ||
      !['black', 'primary', 'secondary'].includes(
        String((background as Record<string, unknown>)['kind']),
      )
    ) {
      return {
        ok: false,
        kind: 'invalid-background',
        message: `Scene "${name}" has an invalid background.`,
      };
    }
    const liveBoardGroupId = value['liveBoardGroupId'];
    if (liveBoardGroupId !== undefined && !validText(liveBoardGroupId)) {
      return {
        ok: false,
        kind: 'invalid-scene',
        message: `Scene "${name}" has an invalid live-board group id.`,
      };
    }
    if (
      liveBoardGroupId !== undefined &&
      team &&
      !team.groups.some((group) => group.id === liveBoardGroupId)
    ) {
      return {
        ok: false,
        kind: 'missing-group',
        message: `Scene "${name}" references a missing live-board group.`,
      };
    }
    scenes.push({
      id,
      name,
      layout: value['layout'] as LayoutNode,
      ...(liveBoardGroupId === undefined ? {} : { liveBoardGroupId }),
      background: {
        kind: (background as Record<string, unknown>)['kind'] as ShowBackground['kind'],
      },
    });
  }
  if (!ids.has(defaultSceneIdValue)) {
    return {
      ok: false,
      kind: 'missing-default',
      message: `The default scene "${defaultSceneIdValue}" does not exist.`,
    };
  }
  return { ok: true, scenes, defaultSceneId: defaultSceneIdValue };
}

export function addScene(set: SceneSet, scene: Scene, makeDefault = false): SceneSet {
  return {
    scenes: [...set.scenes.map(cloneScene), cloneScene(scene)],
    defaultSceneId: makeDefault ? scene.id : set.defaultSceneId,
  };
}

export function replaceScene(set: SceneSet, scene: Scene): SceneSet {
  return {
    scenes: set.scenes.map((item) => (item.id === scene.id ? cloneScene(scene) : cloneScene(item))),
    defaultSceneId: set.defaultSceneId,
  };
}

export function setDefaultScene(set: SceneSet, sceneId: string): SceneSet {
  return { scenes: set.scenes.map(cloneScene), defaultSceneId: sceneId };
}

export function removeScene(set: SceneSet, sceneId: string): SceneSet | null {
  if (set.scenes.length <= 1 || !sceneById(set.scenes, sceneId)) return null;
  const scenes = set.scenes.filter((scene) => scene.id !== sceneId).map(cloneScene);
  return {
    scenes,
    defaultSceneId:
      set.defaultSceneId === sceneId ? (scenes[0]?.id ?? set.defaultSceneId) : set.defaultSceneId,
  };
}

export function renameScene(set: SceneSet, sceneId: string, name: string): SceneSet {
  return {
    scenes: set.scenes.map((scene) =>
      scene.id === sceneId ? { ...cloneScene(scene), name: name.trim() } : cloneScene(scene),
    ),
    defaultSceneId: set.defaultSceneId,
  };
}
