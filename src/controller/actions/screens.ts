/**
 * Screens: complete audience compositions of one to four panels.
 *
 * Editing a Screen is a document change. Editing the Screen that is on air
 * reaches the audience immediately (the sync layer re-applies it), which the
 * editor makes explicit rather than forbidding.
 */

import type { PanelContent, Screen, ShowBackground } from '@core/domain.js';
import {
  cloneScreen,
  screenFromTemplate,
  updatePanelContent,
  type ScreenTemplateId,
} from '@core/screens.js';
import { ask } from '../state/dialogs.js';
import { defaultLiveGroup, teamOf } from '../state/derive.js';
import { getState, setState } from '../state/store.js';
import { setScreens } from './edit.js';
import { notify } from './notify.js';

type Template = Exclude<ScreenTemplateId, 'imported'>;

function screens(): Screen[] {
  return getState().doc.show.data.screens;
}

function nameTaken(name: string, exceptId?: string): boolean {
  const normalized = name.trim().toLocaleLowerCase();
  return screens().some(
    (screen) => screen.id !== exceptId && screen.name.trim().toLocaleLowerCase() === normalized,
  );
}

function uniqueName(base: string): string {
  if (!nameTaken(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base} ${index}`;
    if (!nameTaken(candidate)) return candidate;
  }
}

function newId(name: string): string {
  const stem =
    name
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'screen';
  const ids = new Set(screens().map((screen) => screen.id));
  if (!ids.has(stem)) return stem;
  for (let index = 2; ; index += 1) if (!ids.has(`${stem}-${index}`)) return `${stem}-${index}`;
}

function replace(screen: Screen): void {
  setScreens(screens().map((item) => (item.id === screen.id ? screen : item)));
}

function statsContent(): PanelContent {
  const team = teamOf(getState().doc.show.data);
  const group = team ? defaultLiveGroup(team) : undefined;
  return group ? { kind: 'stats', groupId: group.id } : { kind: 'stats' };
}

export const TEMPLATE_DEFAULTS: Record<Template, PanelContent['kind'][]> = {
  full: ['media'],
  'half-left-right': ['media', 'score'],
  '65-35-left-right': ['media', 'score'],
  '35-65-left-right': ['score', 'media'],
  'half-top-bottom': ['media', 'blank'],
};

function contentFor(kind: PanelContent['kind']): PanelContent {
  return kind === 'stats' ? statsContent() : ({ kind } as PanelContent);
}

export function createScreen(template: Template, contents?: PanelContent['kind'][]): string {
  const name = uniqueName('New Screen');
  const id = newId(name);
  const kinds = contents ?? TEMPLATE_DEFAULTS[template];
  const screen = screenFromTemplate(template, name, id, kinds.map(contentFor));
  setScreens([...screens(), screen]);
  setState({ editingScreenId: id, selectedPanelId: screen.panels[0]?.id ?? null, mode: 'screens' });
  return id;
}

export function duplicateScreen(screenId: string): void {
  const source = screens().find((screen) => screen.id === screenId);
  if (!source) return;
  const name = uniqueName(`${source.name} Copy`);
  const copy = { ...cloneScreen(source), id: newId(name), name };
  const list = screens().slice();
  list.splice(list.findIndex((screen) => screen.id === screenId) + 1, 0, copy);
  setScreens(list);
  setState({ editingScreenId: copy.id, selectedPanelId: copy.panels[0]?.id ?? null });
}

export function renameScreen(screenId: string, name: string): string | null {
  const value = name.trim();
  if (!value) return 'Enter a name.';
  if (nameTaken(value, screenId)) return 'Another Screen already uses that name.';
  const screen = screens().find((item) => item.id === screenId);
  if (!screen || screen.name === value) return null;
  replace({ ...screen, name: value });
  return null;
}

export async function promptRenameScreen(screenId: string): Promise<void> {
  const screen = screens().find((item) => item.id === screenId);
  if (!screen) return;
  const name = await ask.text({
    title: 'Rename Screen',
    label: 'Screen name',
    initialValue: screen.name,
    confirmLabel: 'Rename',
    maxLength: 40,
    validate: (value) =>
      nameTaken(value, screenId) ? 'Another Screen already uses that name.' : null,
  });
  if (name) renameScreen(screenId, name);
}

export function deleteScreen(screenId: string): void {
  const state = getState();
  const list = screens();
  const index = list.findIndex((screen) => screen.id === screenId);
  const screen = list[index];
  if (!screen) return;
  if (state.output.liveScreenId === screenId) {
    notify.warning('Switch to another Screen before deleting the one on air.');
    return;
  }
  if (list.length <= 1) {
    notify.warning('A show needs at least one Screen.');
    return;
  }
  const wasDefault = state.doc.show.data.defaultScreenId === screenId;
  const remaining = list.filter((item) => item.id !== screenId);
  setScreens(remaining, wasDefault ? remaining[0]!.id : undefined);
  setState((s) => ({
    editingScreenId:
      s.editingScreenId === screenId
        ? (remaining[Math.max(0, index - 1)]?.id ?? null)
        : s.editingScreenId,
    armedScreenId: s.armedScreenId === screenId ? s.doc.show.data.defaultScreenId : s.armedScreenId,
  }));
  notify.undoable(`Deleted the Screen ${screen.name}`, {
    run: () => {
      if (screens().some((item) => item.id === screenId)) return;
      const restored = screens().slice();
      restored.splice(Math.min(index, restored.length), 0, screen);
      setScreens(restored, wasDefault ? screenId : undefined);
    },
  });
}

export function setDefaultScreen(screenId: string): void {
  if (getState().doc.show.data.defaultScreenId === screenId) return;
  setScreens(screens(), screenId);
}

export function moveScreen(screenId: string, overId: string): void {
  const list = screens().slice();
  const from = list.findIndex((screen) => screen.id === screenId);
  const to = list.findIndex((screen) => screen.id === overId);
  if (from < 0 || to < 0 || from === to) return;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved!);
  setScreens(list);
}

export function nudgeScreen(screenId: string, delta: number): void {
  const list = screens();
  const from = list.findIndex((screen) => screen.id === screenId);
  const over = list[Math.max(0, Math.min(list.length - 1, from + delta))];
  if (from >= 0 && over) moveScreen(screenId, over.id);
}

/** Choosing a template is an explicit reset of the Screen's geometry. */
export function applyTemplate(screenId: string, template: Template): void {
  const screen = screens().find((item) => item.id === screenId);
  if (!screen) return;
  const defaults = TEMPLATE_DEFAULTS[template];
  const existing = screen.importedLayout ? [] : screen.panels.map((panel) => panel.content);
  const count = template === 'full' ? 1 : 2;
  const contents: PanelContent[] = [];
  for (let index = 0; index < count; index += 1)
    contents.push(existing[index] ?? contentFor(defaults[index] ?? 'blank'));
  // Keep at most one media panel: the rotation plays in exactly one place.
  let sawMedia = false;
  const unique = contents.map((content) => {
    if (content.kind !== 'media') return content;
    if (sawMedia) return { kind: 'blank' } as PanelContent;
    sawMedia = true;
    return content;
  });
  const next = screenFromTemplate(template, screen.name, screen.id, unique);
  replace({ ...next, background: { ...screen.background } });
  setState({ selectedPanelId: next.panels[0]?.id ?? null });
}

/**
 * Assign content to a panel. Only one panel per Screen may show the rotation,
 * so choosing Media for a second panel swaps the two panels' content.
 */
export function setPanelContent(
  screenId: string,
  panelId: string,
  kind: PanelContent['kind'],
): void {
  const screen = screens().find((item) => item.id === screenId);
  const panel = screen?.panels.find((item) => item.id === panelId);
  if (!screen || !panel || panel.content.kind === kind) return;
  let next = screen;
  if (kind === 'media') {
    const other = screen.panels.find(
      (item) => item.id !== panelId && item.content.kind === 'media',
    );
    if (other) next = updatePanelContent(next, other.id, panel.content);
  }
  next = updatePanelContent(next, panelId, contentFor(kind));
  replace(next);
}

export function setPanelStatsGroup(screenId: string, panelId: string, groupId: string): void {
  const screen = screens().find((item) => item.id === screenId);
  if (!screen) return;
  replace(updatePanelContent(screen, panelId, { kind: 'stats', groupId }));
}

export function setScreenBackground(screenId: string, kind: ShowBackground['kind']): void {
  const screen = screens().find((item) => item.id === screenId);
  if (!screen || screen.background.kind === kind) return;
  replace({ ...screen, background: { kind } });
}

export function editScreen(screenId: string | null): void {
  const screen = screenId ? screens().find((item) => item.id === screenId) : undefined;
  setState({
    editingScreenId: screen?.id ?? null,
    selectedPanelId: screen?.panels[0]?.id ?? null,
    ...(screen ? { mode: 'screens' as const } : {}),
  });
}

export function selectPanel(panelId: string | null): void {
  setState({ selectedPanelId: panelId });
}
