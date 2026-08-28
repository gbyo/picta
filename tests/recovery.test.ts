import { describe, expect, it } from 'vitest';
import { defaultMediaSet } from '../src/core/media.js';
import { FULL_LAYOUT } from '../src/core/layouts.js';
import { newDocumentSession } from '../src/app/document-lifecycle.js';
import {
  createRecoverySnapshot,
  parseRecoverySnapshot,
  serializeRecoverySnapshot,
} from '../src/app/recovery.js';

function showData() {
  return {
    version: 2 as const,
    media: { kind: 'inline' as const, data: defaultMediaSet('Recovery') },
    event: { stats: {}, liveGroups: {} },
    scenes: [
      {
        id: 'default',
        name: 'Default',
        layout: FULL_LAYOUT,
        background: { kind: 'black' as const },
      },
    ],
    defaultSceneId: 'default',
  };
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
