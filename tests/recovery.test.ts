import { describe, expect, it } from 'vitest';
import { newDocumentSession } from '../src/app/document-lifecycle.js';
import { defaultShowDocument } from '../src/core/show-file.js';
import {
  createRecoverySnapshot,
  parseRecoverySnapshot,
  serializeRecoverySnapshot,
} from '../src/app/recovery.js';

function showData() {
  return defaultShowDocument();
}

describe('machine-local recovery snapshots', () => {
  it('round-trips a dirty snapshot without changing the public show shape', () => {
    const session = newDocumentSession(showData());
    session.show.dirty = true;
    const snapshot = createRecoverySnapshot(session, 1234);
    const parsed = parseRecoverySnapshot(serializeRecoverySnapshot(snapshot));

    expect(parsed).toEqual(snapshot);
    expect(parsed?.data.media.kind).toBe('inline');
  });

  it('rejects corrupt, obsolete, and inconsistent recovery data safely', () => {
    const session = newDocumentSession(showData());
    session.show.dirty = true;
    const valid = createRecoverySnapshot(session, 1234);
    const encoded = JSON.parse(serializeRecoverySnapshot(valid)) as Record<string, unknown>;

    for (const value of ['{', null, [], { ...encoded, version: 99 }, { ...encoded, data: null }]) {
      expect(parseRecoverySnapshot(value)).toBeNull();
    }

    const inconsistent = {
      ...encoded,
      mediaFilePath: '/tmp/other.pictaset',
    };
    expect(parseRecoverySnapshot(inconsistent)).toBeNull();
  });

  it('does not retain a clean snapshot as recoverable work', () => {
    const session = newDocumentSession(showData());
    expect(
      parseRecoverySnapshot(serializeRecoverySnapshot(createRecoverySnapshot(session))),
    ).toBeNull();
  });
});
