/**
 * Small, DOM-free pieces of document/resource lifecycle orchestration.
 *
 * The controller still owns operator prompts and rendering, but candidate
 * loading and state commits have explicit boundaries here.  In particular, a
 * failed or stale load can never call the commit callback.
 */

import type { MediaSet, ShowDocument, Team } from '../core/domain.js';
import { defaultVolleyballScore } from '../core/score.js';
import type { ResourceOpenResult } from './resource-io.js';
import type { ShowOpenResult } from './show-io.js';

export interface DocumentSession {
  show: { filePath: string | null; data: ShowDocument; dirty: boolean };
  mediaFilePath: string | null;
  mediaDirty: boolean;
  teamFilePath: string | null;
  teamDirty: boolean;
}

export type SuccessfulShowOpen = Extract<ShowOpenResult, { ok: true }>;
export type SuccessfulMediaOpen = Extract<ResourceOpenResult<MediaSet>, { ok: true }>;
export type SuccessfulTeamOpen = Extract<ResourceOpenResult<Team>, { ok: true }>;

/** A monotonically increasing token for one kind of user operation. */
export class OperationGeneration {
  #generation = 0;

  start(): number {
    this.#generation += 1;
    return this.#generation;
  }

  isCurrent(token: number): boolean {
    return token === this.#generation;
  }

  invalidate(): void {
    this.#generation += 1;
  }
}

export type LatestOpenOutcome<T> =
  | { status: 'stale' }
  | { status: 'cancelled' }
  | { status: 'failed'; value: T }
  | { status: 'error'; error: unknown }
  | { status: 'committed'; value: T };

/**
 * Run an asynchronous open and commit only the latest successful candidate.
 * The caller can return null for a cancelled dialog.  Errors from stale work
 * are deliberately suppressed so an older action cannot report over a newer
 * choice.
 */
export async function runLatestOpen<T>(
  operations: OperationGeneration,
  load: () => Promise<T | null>,
  isSuccess: (value: T) => boolean,
  commit: (value: T) => void,
): Promise<LatestOpenOutcome<T>> {
  const token = operations.start();
  let value: T | null;
  try {
    value = await load();
  } catch (error) {
    return operations.isCurrent(token) ? { status: 'error', error } : { status: 'stale' };
  }
  if (!operations.isCurrent(token)) return { status: 'stale' };
  if (value === null) return { status: 'cancelled' };
  if (!isSuccess(value)) return { status: 'failed', value };
  // There is no await between this check and commit, so another user action
  // cannot interleave with the state transition on the JS event loop.
  commit(value);
  return { status: 'committed', value };
}

export function newDocumentSession(data: ShowDocument | unknown): DocumentSession {
  return {
    show: { filePath: null, data: data as ShowDocument, dirty: false },
    mediaFilePath: null,
    mediaDirty: false,
    teamFilePath: null,
    teamDirty: false,
  };
}

export function sessionFromShow(result: SuccessfulShowOpen): DocumentSession {
  return {
    show: { filePath: result.filePath, data: result.data, dirty: false },
    mediaFilePath: result.data.media.kind === 'file' ? result.data.media.path : null,
    mediaDirty: false,
    teamFilePath: result.data.team?.kind === 'file' ? result.data.team.path : null,
    teamDirty: false,
  };
}

export function replaceMediaInSession(
  current: DocumentSession,
  result: SuccessfulMediaOpen,
): DocumentSession {
  return {
    ...current,
    show: {
      ...current.show,
      data: {
        ...current.show.data,
        media: { kind: 'file', path: result.filePath, data: result.data },
      },
    },
    mediaFilePath: result.filePath,
    mediaDirty: false,
  };
}

export function replaceTeamInSession(
  current: DocumentSession,
  result: SuccessfulTeamOpen,
): DocumentSession {
  return {
    ...current,
    show: {
      ...current.show,
      data: {
        ...current.show.data,
        team: { kind: 'file', path: result.filePath, data: result.data },
        event: { stats: {}, liveGroups: {}, score: defaultVolleyballScore(result.data) },
      },
    },
    teamFilePath: result.filePath,
    teamDirty: false,
  };
}

export function inlineMediaSession(current: DocumentSession, data: MediaSet): DocumentSession {
  return {
    ...current,
    show: {
      ...current.show,
      data: { ...current.show.data, media: { kind: 'inline', data } },
      dirty: true,
    },
    mediaFilePath: null,
    mediaDirty: true,
  };
}
