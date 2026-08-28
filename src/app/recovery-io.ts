/** Native storage adapter for the machine-local recovery snapshot. */

import * as ipc from './ipc.js';
import {
  parseRecoverySnapshot,
  serializeRecoverySnapshot,
  type RecoverySnapshot,
} from './recovery.js';

export async function readRecoverySnapshot(): Promise<RecoverySnapshot | null> {
  try {
    const raw = await ipc.loadRecovery();
    const snapshot = parseRecoverySnapshot(raw);
    if (snapshot) return snapshot;
    // Corrupt or obsolete recovery is disposable. It must never block startup.
    await ipc.clearRecovery().catch(() => undefined);
    return null;
  } catch {
    return null;
  }
}

export async function writeRecoverySnapshot(snapshot: RecoverySnapshot): Promise<void> {
  await ipc.saveRecovery(JSON.parse(serializeRecoverySnapshot(snapshot)));
}

export async function discardRecoverySnapshot(): Promise<void> {
  await ipc.clearRecovery().catch(() => undefined);
}
