/** Workspace navigation and other purely presentational state. */

import { getState, setState, type Mode } from '../state/store.js';

export function setMode(mode: Mode): void {
  if (getState().mode !== mode) setState({ mode });
}

export function setConsoleTab(tab: 'stats' | 'cues'): void {
  setState({ consoleTab: tab });
}

export function openPalette(open = true): void {
  setState({ paletteOpen: open });
}

export function openShortcuts(open = true): void {
  setState({ shortcutsOpen: open });
}

export function toggleSafeArea(): void {
  setState((state) => ({ showSafeArea: !state.showSafeArea }));
}

const THEME_KEY = 'picta.theme';

export function setTheme(theme: 'dark' | 'light'): void {
  setState({ theme });
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // A per-machine convenience; losing it is harmless.
  }
}

export function storedTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}
