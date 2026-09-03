/** Machine-local crash recovery snapshots. Never part of a public document. */

import type { ShowDocument } from '../core/domain.js';
import { parsePictaV2 } from '../core/show-file.js';
import type { DocumentSession } from './document-lifecycle.js';

export const RECOVERY_FORMAT_VERSION = 1;

export interface RecoverySnapshot {
  version: 1;
  savedAt: number;
  showFilePath: string | null;
  data: ShowDocument;
  mediaFilePath: string | null;
  mediaDirty: boolean;
  teamFilePath: string | null;
  teamDirty: boolean;
  showDirty: boolean;
}

export function createRecoverySnapshot(
  session: DocumentSession,
  savedAt = Date.now(),
): RecoverySnapshot {
  return {
    version: RECOVERY_FORMAT_VERSION,
    savedAt,
    showFilePath: session.show.filePath,
    data: session.show.data,
    mediaFilePath: session.mediaFilePath,
    mediaDirty: session.mediaDirty,
    teamFilePath: session.teamFilePath,
    teamDirty: session.teamDirty,
    showDirty: session.show.dirty,
  };
}

export function hasUnsavedWork(snapshot: RecoverySnapshot): boolean {
  return snapshot.showDirty || snapshot.mediaDirty || snapshot.teamDirty;
}

export function serializeRecoverySnapshot(snapshot: RecoverySnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPath(value: unknown, extension: string): value is string {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    !value.includes('\0') &&
    value.toLowerCase().endsWith(`.${extension}`)
  );
}

function optionalPath(value: unknown, extension: string): string | null | undefined {
  if (value === null) return null;
  return isPath(value, extension) ? value : undefined;
}

/** Parse and validate untrusted recovery data without ever throwing. */
export function parseRecoverySnapshot(raw: unknown): RecoverySnapshot | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isObject(value)) return null;
  if (value['version'] !== RECOVERY_FORMAT_VERSION) return null;
  const savedAt = value['savedAt'];
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt <= 0) return null;

  const showFilePath = optionalPath(value['showFilePath'], 'picta');
  const mediaFilePath = optionalPath(value['mediaFilePath'], 'pictaset');
  const teamFilePath = optionalPath(value['teamFilePath'], 'pictateam');
  if (showFilePath === undefined || mediaFilePath === undefined || teamFilePath === undefined)
    return null;
  if (typeof value['mediaDirty'] !== 'boolean') return null;
  if (typeof value['teamDirty'] !== 'boolean') return null;
  if (typeof value['showDirty'] !== 'boolean') return null;

  const encodedData = JSON.stringify(value['data']);
  if (typeof encodedData !== 'string') return null;
  const parsed = parsePictaV2(encodedData);
  if (!parsed.ok) return null;
  if (parsed.value.media.kind === 'file') {
    if (mediaFilePath !== parsed.value.media.path) return null;
  } else if (mediaFilePath !== null) {
    return null;
  }
  if (parsed.value.team?.kind === 'file') {
    if (teamFilePath !== parsed.value.team.path) return null;
  } else if (teamFilePath !== null) {
    return null;
  }
  const snapshot: RecoverySnapshot = {
    version: RECOVERY_FORMAT_VERSION,
    savedAt,
    showFilePath,
    data: parsed.value,
    mediaFilePath,
    mediaDirty: value['mediaDirty'],
    teamFilePath,
    teamDirty: value['teamDirty'],
    showDirty: value['showDirty'],
  };
  return hasUnsavedWork(snapshot) ? snapshot : null;
}
