/**
 * When to check for a new Picta, and whether to say anything about it.
 *
 * Picta only ever *tells* the operator that a newer version exists; it never
 * downloads or installs anything. Keeping the decisions here means the rules
 * are testable without a network, and the rule that matters most is easy to
 * read: never interrupt a running show.
 */

/** A day, in milliseconds. */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface UpdateStatus {
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  url: string;
}

export interface UpdateCheckState {
  /** Automatic checking switched on. */
  enabled: boolean;
  /** When the last automatic check happened, in epoch milliseconds. */
  lastCheck: number | null;
  /** A version the operator has already been told about and dismissed. */
  dismissedVersion: string | null;
}

/**
 * Whether an automatic check is due.
 *
 * A check is due at launch (nothing recorded yet) and then once a day, so a
 * machine left switched on for a week still learns about a new release.
 */
export function shouldCheckNow(
  state: UpdateCheckState,
  now: number,
  options: { running: boolean },
): boolean {
  // Never touch the network while images are on an output display. A show is
  // the one thing Picta must not disturb.
  if (options.running) return false;
  if (!state.enabled) return false;
  if (state.lastCheck === null) return true;
  // A clock that has moved backwards (or a hand-edited preferences file) should
  // trigger a check rather than lock checking out forever.
  if (!Number.isFinite(state.lastCheck) || state.lastCheck > now) return true;
  return now - state.lastCheck >= UPDATE_CHECK_INTERVAL_MS;
}

/** Whether this status is worth putting on screen. */
export function shouldNotify(status: UpdateStatus, dismissedVersion: string | null): boolean {
  if (!status.available) return false;
  if (status.latestVersion === null) return false;
  // Say it once per version. Dismissing 1.1.0 must not hide 1.2.0.
  return status.latestVersion !== dismissedVersion;
}

/** The one line shown in the controller. */
export function updateNoticeText(status: UpdateStatus): string {
  return `Picta ${status.latestVersion} is available. You are running ${status.currentVersion}.`;
}
