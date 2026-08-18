/**
 * Machine-specific preferences.
 *
 * These are facts about *this computer*, which is exactly why they live here
 * and not in a `.picta` document: a saved show carried to another machine must
 * not drag along someone else's monitor or window layout.
 *
 * The file is validated on every read. A corrupt or hand-edited preferences
 * file degrades to defaults; it never throws and never stops Picta starting.
 */

import { loadPrefs, savePrefs } from './ipc.js';
import type { DisplayHint } from '../core/monitors.js';

export interface Prefs {
  displayHint: DisplayHint | null;
  lastDirectory: string | null;
  window: { width: number; height: number; x: number; y: number } | null;
  /** Automatic update checking. On unless the operator turns it off. */
  updateChecks: boolean;
  lastUpdateCheck: number | null;
  dismissedVersion: string | null;
}

export const emptyPrefs: Prefs = {
  displayHint: null,
  lastDirectory: null,
  window: null,
  updateChecks: true,
  lastUpdateCheck: null,
  dismissedVersion: null,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseHint(raw: unknown): DisplayHint | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o['fingerprint'] !== 'string') return null;
  if (!isFiniteNumber(o['width']) || !isFiniteNumber(o['height'])) return null;
  if (!isFiniteNumber(o['scaleFactor'])) return null;
  if (!isFiniteNumber(o['x']) || !isFiniteNumber(o['y'])) return null;
  const name = o['name'];
  return {
    fingerprint: o['fingerprint'],
    name: typeof name === 'string' ? name : null,
    width: o['width'],
    height: o['height'],
    scaleFactor: o['scaleFactor'],
    x: o['x'],
    y: o['y'],
  };
}

function parseWindow(raw: unknown): Prefs['window'] {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!isFiniteNumber(o['width']) || !isFiniteNumber(o['height'])) return null;
  if (!isFiniteNumber(o['x']) || !isFiniteNumber(o['y'])) return null;
  if (o['width'] < 200 || o['height'] < 200) return null;
  return { width: o['width'], height: o['height'], x: o['x'], y: o['y'] };
}

export function parsePrefs(raw: unknown): Prefs {
  if (typeof raw !== 'object' || raw === null) return { ...emptyPrefs };
  const o = raw as Record<string, unknown>;
  const lastDirectory = o['lastDirectory'];
  const lastUpdateCheck = o['lastUpdateCheck'];
  const dismissedVersion = o['dismissedVersion'];
  return {
    displayHint: parseHint(o['displayHint']),
    lastDirectory: typeof lastDirectory === 'string' && lastDirectory !== '' ? lastDirectory : null,
    window: parseWindow(o['window']),
    // Anything other than an explicit `false` leaves checking on, matching the
    // default the native menu is built with.
    updateChecks: o['updateChecks'] !== false,
    lastUpdateCheck: isFiniteNumber(lastUpdateCheck) ? lastUpdateCheck : null,
    dismissedVersion: typeof dismissedVersion === 'string' ? dismissedVersion : null,
  };
}

export async function readPrefs(): Promise<Prefs> {
  try {
    return parsePrefs(await loadPrefs());
  } catch {
    return { ...emptyPrefs };
  }
}

let writeHandle: number | null = null;
let queued: Prefs | null = null;

/** Coalesces bursts of writes; preferences are never worth a synchronous stall. */
export function writePrefs(prefs: Prefs): void {
  queued = prefs;
  if (writeHandle !== null) return;
  writeHandle = window.setTimeout(() => {
    writeHandle = null;
    const value = queued;
    queued = null;
    if (value) void savePrefs(value).catch(() => undefined);
  }, 400);
}

export async function flushPrefs(prefs: Prefs): Promise<void> {
  if (writeHandle !== null) {
    window.clearTimeout(writeHandle);
    writeHandle = null;
  }
  queued = null;
  try {
    await savePrefs(prefs);
  } catch {
    // Losing window geometry is not worth blocking a quit.
  }
}
