/**
 * Scene controls, split the way an operator thinks about them.
 *
 * Switching scenes is a runtime operation and lives in the compact global
 * strip.  Creating, renaming, reordering and deleting scenes is configuration
 * and lives in Output, behind a menu, so a destructive action never sits next
 * to a live control during a game.
 */

import type { Scene } from '../core/domain.js';

export interface SceneStripElements {
  strip: HTMLElement;
  buttons: HTMLElement;
}

export interface ScenePickerElements {
  picker: HTMLElement;
  current: HTMLElement;
  hint: HTMLElement;
  duplicate: HTMLButtonElement;
  rename: HTMLButtonElement;
  makeDefault: HTMLButtonElement;
  moveLeft: HTMLButtonElement;
  moveRight: HTMLButtonElement;
  remove: HTMLButtonElement;
}

export interface SceneDialogElements {
  dialog: HTMLDialogElement;
  form: HTMLFormElement;
  title: HTMLElement;
  name: HTMLInputElement;
  error: HTMLElement;
  confirm: HTMLButtonElement;
}

export interface SceneDeleteDialogElements {
  dialog: HTMLDialogElement;
  text: HTMLElement;
}

export interface SceneStripView {
  scenes: readonly Scene[];
  /** What the physical board is using right now. */
  activeSceneId: string | null;
  live: boolean;
  onSwitch(sceneId: string): void;
}

export interface ScenePickerView {
  scenes: readonly Scene[];
  selectedSceneId: string;
  activeSceneId: string | null;
  defaultSceneId: string;
  live: boolean;
  editing: boolean;
  onSelect(sceneId: string): void;
}

function sceneButton(scene: Scene, pressed: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'scene-button';
  button.textContent = scene.name;
  button.dataset['sceneId'] = scene.id;
  button.setAttribute('aria-pressed', String(pressed));
  button.addEventListener('click', onClick);
  return button;
}

/**
 * The global strip is switch-only, and only while output is live.  A stopped
 * Picta showing images needs no scene chrome on every tab.
 */
export function renderSceneStrip(elements: SceneStripElements, view: SceneStripView): void {
  elements.strip.hidden = !view.live;
  elements.buttons.replaceChildren();
  if (!view.live) return;
  for (const scene of view.scenes) {
    elements.buttons.append(
      sceneButton(scene, scene.id === view.activeSceneId, () => view.onSwitch(scene.id)),
    );
  }
}

export function renderScenePicker(elements: ScenePickerElements, view: ScenePickerView): void {
  elements.picker.replaceChildren();
  for (const scene of view.scenes) {
    const button = sceneButton(scene, scene.id === view.selectedSceneId, () =>
      view.onSelect(scene.id),
    );
    if (view.live && scene.id === view.activeSceneId) button.classList.add('scene-live');
    if (scene.id === view.defaultSceneId) {
      const star = document.createElement('span');
      star.className = 'scene-default-mark';
      star.textContent = '★';
      star.title = 'Default scene';
      button.append(' ', star);
    }
    button.disabled = view.editing;
    elements.picker.append(button);
  }

  const selected = view.scenes.find((scene) => scene.id === view.selectedSceneId);
  const isDefault = view.selectedSceneId === view.defaultSceneId;
  elements.current.textContent = selected ? `${selected.name}${isDefault ? ' · default' : ''}` : '';

  // Say plainly which scene Start Output will use, so "selected" and
  // "default" never differ invisibly.
  elements.hint.textContent = view.live
    ? view.activeSceneId && view.activeSceneId !== view.selectedSceneId
      ? `Live on ${view.scenes.find((scene) => scene.id === view.activeSceneId)?.name ?? '—'}.`
      : 'Live now.'
    : selected
      ? `Start with ${selected.name}.`
      : '';

  const index = view.scenes.findIndex((scene) => scene.id === view.selectedSceneId);
  const activeLive = view.live && view.selectedSceneId === view.activeSceneId;
  elements.duplicate.disabled = view.editing;
  elements.rename.disabled = view.editing;
  elements.makeDefault.disabled = view.editing || isDefault;
  elements.moveLeft.disabled = view.editing || index <= 0;
  elements.moveRight.disabled = view.editing || index < 0 || index >= view.scenes.length - 1;
  // Never delete the scene on the board, and never delete the last one.
  elements.remove.disabled = view.editing || activeLive || view.scenes.length <= 1;
}

export type SceneDialogKind = 'new' | 'rename' | 'duplicate';

export interface SceneDialogRequest {
  kind: SceneDialogKind;
  initialName: string;
  /** Return an error message to keep the dialog open, or null to accept. */
  validate(name: string): string | null;
}

const DIALOG_TITLES: Record<SceneDialogKind, string> = {
  new: 'New Scene',
  rename: 'Rename Scene',
  duplicate: 'Duplicate Scene',
};

const DIALOG_CONFIRM: Record<SceneDialogKind, string> = {
  new: 'Create',
  rename: 'Rename',
  duplicate: 'Duplicate',
};

/**
 * A small native dialog in place of window.prompt, validated inline so a
 * duplicate name never costs the operator the whole dialog.
 */
export function askSceneName(
  elements: SceneDialogElements,
  request: SceneDialogRequest,
): Promise<string | null> {
  elements.title.textContent = DIALOG_TITLES[request.kind];
  elements.confirm.textContent = DIALOG_CONFIRM[request.kind];
  elements.name.value = request.initialName;
  elements.error.hidden = true;
  elements.error.textContent = '';

  return new Promise((resolve) => {
    const onSubmit = (event: SubmitEvent): void => {
      if ((event.submitter as HTMLButtonElement | null)?.value !== 'confirm') return;
      const name = elements.name.value.trim();
      const error = name === '' ? 'Enter a scene name.' : request.validate(name);
      if (!error) return;
      event.preventDefault();
      elements.error.textContent = error;
      elements.error.hidden = false;
    };
    const onClose = (): void => {
      elements.form.removeEventListener('submit', onSubmit);
      const value = elements.dialog.returnValue;
      resolve(value === 'confirm' ? elements.name.value.trim() : null);
    };
    elements.form.addEventListener('submit', onSubmit);
    elements.dialog.addEventListener('close', onClose, { once: true });
    elements.dialog.returnValue = 'cancel';
    elements.dialog.showModal();
    elements.name.select();
  });
}

export function confirmDeleteScene(
  elements: SceneDeleteDialogElements,
  sceneName: string,
): Promise<boolean> {
  elements.text.textContent = `Delete the scene “${sceneName}”? This cannot be undone.`;
  elements.dialog.returnValue = 'cancel';
  elements.dialog.showModal();
  return new Promise((resolve) =>
    elements.dialog.addEventListener(
      'close',
      () => resolve(elements.dialog.returnValue === 'delete'),
      { once: true },
    ),
  );
}
