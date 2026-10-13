/**
 * Keyboard shortcuts: one table drives the handler, the shortcut sheet and the
 * key hints on buttons, so what the UI promises is what the keyboard does.
 *
 * Shortcuts never fire while the operator is typing, while a dialog, menu or
 * popover has focus, or when a focused control already owns the key (Space on
 * a button presses the button; arrows in a list move through the list).
 */

import { rt } from './runtime';
import { anyDialogOpen } from './state/dialogs';
import { getState } from './state/store';
import { scoreInUse } from './state/derive';
import { nextMedia, previousMedia, selectScreen } from './actions/output';
import { endCue } from './actions/cues';
import { rally, undoScoreAction, undoLastStat } from './actions/match';
import { openPalette, openShortcuts, setMode } from './actions/ui';
import { newShow, openShow, saveShow } from './actions/document';

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export const mod = isMac ? '⌘' : 'Ctrl+';

export interface ShortcutInfo {
  keys: string[];
  label: string;
  group: 'Output' | 'Score' | 'Stats' | 'Workspace' | 'Show';
}

/** For the shortcut sheet. */
export const SHORTCUTS: ShortcutInfo[] = [
  { keys: ['→'], label: 'Next media', group: 'Output' },
  { keys: ['Space'], label: 'Next media (when no button has focus)', group: 'Output' },
  { keys: ['←'], label: 'Previous media', group: 'Output' },
  { keys: ['Esc'], label: 'End the cue on air (never stops output)', group: 'Output' },
  { keys: ['1', '–', '9'], label: 'Switch to Screen 1–9 (arms it while off air)', group: 'Output' },
  { keys: ['Q'], label: 'Point to the left team (they serve)', group: 'Score' },
  { keys: ['P'], label: 'Point to the right team (they serve)', group: 'Score' },
  { keys: ['Z'], label: 'Undo the last score change', group: 'Score' },
  { keys: ['⇧', 'Z'], label: 'Undo the last stat', group: 'Stats' },
  { keys: [mod.replace('+', ''), 'K'], label: 'Command palette', group: 'Workspace' },
  {
    keys: [mod.replace('+', ''), '1–4'],
    label: 'Console, Media, Roster, Screens',
    group: 'Workspace',
  },
  { keys: ['?'], label: 'Keyboard shortcuts', group: 'Workspace' },
  { keys: [mod.replace('+', ''), 'N'], label: 'New show', group: 'Show' },
  { keys: [mod.replace('+', ''), 'O'], label: 'Open show', group: 'Show' },
  { keys: [mod.replace('+', ''), 'S'], label: 'Save show', group: 'Show' },
];

const TYPING =
  'input, textarea, select, [contenteditable="true"], [role="combobox"], [role="textbox"]';
const OWNS_ARROWS =
  '[role="listbox"], [role="tablist"], [role="radiogroup"], [role="menu"], [role="menubar"], [role="slider"], [role="grid"], [role="toolbar"], [data-owns-arrows]';
const OWNS_SPACE =
  'button, summary, a[href], [role="button"], [role="checkbox"], [role="switch"], [role="option"], [role="menuitem"], [role="tab"]';
const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TYPING) !== null;
}

function inOverlay(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(OVERLAY) !== null;
}

export function handleGlobalKey(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) return;
  const target = event.target;
  const state = getState();
  const commandKey = isMac ? event.metaKey : event.ctrlKey;

  // Modified shortcuts work everywhere except while typing.
  if (commandKey && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === 'k') {
      event.preventDefault();
      openPalette(!state.paletteOpen);
      return;
    }
    if (isTypingTarget(target) || anyDialogOpen()) return;
    const modes = { '1': 'console', '2': 'media', '3': 'roster', '4': 'screens' } as const;
    if (key in modes) {
      event.preventDefault();
      setMode(modes[key as keyof typeof modes]);
      return;
    }
    // In the desktop app the native menu owns these accelerators.
    if (!state.native) {
      if (key === 'n') {
        event.preventDefault();
        void newShow();
      } else if (key === 'o') {
        event.preventDefault();
        void openShow();
      } else if (key === 's') {
        event.preventDefault();
        void saveShow(event.shiftKey);
      }
    }
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.repeat && !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  if (isTypingTarget(target) || anyDialogOpen() || state.paletteOpen || state.shortcutsOpen) return;
  if (inOverlay(target)) return;

  const element = target instanceof Element ? target : null;
  const live = state.output.phase === 'live';
  const key = event.key;

  if (key === '?') {
    event.preventDefault();
    openShortcuts();
    return;
  }
  if (key === 'Escape') {
    if (live && rt().output.cueActive) {
      event.preventDefault();
      endCue();
    }
    return;
  }
  if (key === 'ArrowRight' || key === 'ArrowLeft') {
    if (!live || element?.closest(OWNS_ARROWS)) return;
    event.preventDefault();
    if (key === 'ArrowRight') nextMedia();
    else previousMedia();
    return;
  }
  if (key === ' ') {
    if (!live || element?.closest(OWNS_SPACE)) return;
    event.preventDefault();
    nextMedia();
    return;
  }
  if (/^[1-9]$/.test(key)) {
    const screen = state.doc.show.data.screens[Number(key) - 1];
    if (!screen) return;
    event.preventDefault();
    selectScreen(screen.id);
    return;
  }
  const lower = key.toLowerCase();
  if (scoreInUse(state.doc.show.data)) {
    if (lower === 'q' && !event.shiftKey) {
      event.preventDefault();
      rally('home');
      return;
    }
    if (lower === 'p' && !event.shiftKey) {
      event.preventDefault();
      rally('away');
      return;
    }
  }
  if (lower === 'z') {
    event.preventDefault();
    if (event.shiftKey) undoLastStat();
    else undoScoreAction();
  }
}
