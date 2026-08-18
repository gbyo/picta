import { describe, expect, it } from 'vitest';
import { CueQueue } from '../src/core/cues.js';
import type { Cue } from '../src/core/domain.js';
import { MediaPlaybackMachine } from '../src/core/media-playback.js';
import { defaultMediaSet } from '../src/core/media.js';

const card = (name: string): Cue => ({
  type: 'player-card',
  playerId: name,
  target: 'program',
  holdMs: 1,
  number: '',
  name,
  position: '',
  stats: [],
});

describe('cue queue', () => {
  it('skips failed cues and finishes the sequence', async () => {
    const seen: string[] = [];
    const queue = new CueQueue({
      run: async (cue) => {
        seen.push(cue.type === 'player-card' ? cue.name : cue.type);
        return cue.type === 'player-card' && cue.name !== 'bad';
      },
    });
    await queue.play([card('good'), card('bad'), card('last')]);
    expect(seen).toEqual(['good', 'bad', 'last']);
    expect(queue.active).toBe(false);
  });

  it('cancels without running later cues', async () => {
    let resolveFirst: (value: boolean) => void = () => undefined;
    const queue = new CueQueue({
      run: () =>
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        }),
    });
    const promise = queue.play([card('first'), card('second')]);
    queue.cancel();
    resolveFirst(true);
    await promise;
    expect(queue.active).toBe(false);
  });

  it('reports an outcome per cue so callers never guess what played', async () => {
    const queue = new CueQueue({
      run: async (cue) => cue.type === 'player-card' && cue.name !== 'bad',
    });
    await expect(queue.play([card('good'), card('bad'), card('last')])).resolves.toEqual([
      'played',
      'failed',
      'played',
    ]);
  });

  it('reports a cancelled cue as cancelled, not as played', async () => {
    let resolveFirst: (value: boolean) => void = () => undefined;
    const queue = new CueQueue({
      run: () =>
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        }),
    });
    const promise = queue.play([card('only')]);
    queue.cancel();
    // A late resolution from the abandoned cue must not rewrite the outcome.
    resolveFirst(true);
    await expect(promise).resolves.toEqual(['cancelled']);
  });
});

describe('mixed media playback', () => {
  it('uses image timer completion and video ended completion separately', () => {
    const set = defaultMediaSet('Set');
    set.items = [
      { id: 'image', type: 'image', path: '/a.png', durationSeconds: 3 },
      { id: 'video', type: 'video', path: '/b.mp4' },
    ];
    const machine = new MediaPlaybackMachine(set);
    const first = machine.start();
    expect(first?.type).toBe('request');
    if (!first || first.type !== 'request') return;
    const ready = machine.ready(first.token);
    expect(ready).toEqual({ type: 'wait-image', index: 0, durationMs: 3000 });
    const second = machine.imageTimerFired(0);
    expect(second?.type).toBe('request');
    if (!second || second.type !== 'request') return;
    expect(machine.ready(second.token)).toBeNull();
    const third = machine.videoEnded(1);
    expect(third?.type).toBe('request');
  });

  it('ignores duplicate stale playback events', () => {
    const set = defaultMediaSet('Set');
    set.items = [{ id: 'image', type: 'image', path: '/a.png' }];
    const machine = new MediaPlaybackMachine(set);
    const request = machine.start();
    expect(request?.type).toBe('request');
    if (!request || request.type !== 'request') return;
    expect(machine.ready(request.token)).not.toBeNull();
    expect(machine.ready(request.token)).toBeNull();
  });

  it('pauses and resumes the same current item for an edit preview', () => {
    const set = defaultMediaSet('Set');
    set.items = [{ id: 'image', type: 'image', path: '/a.png' }];
    const machine = new MediaPlaybackMachine(set);
    const request = machine.start();
    expect(request?.type).toBe('request');
    if (!request || request.type !== 'request') return;
    machine.ready(request.token);
    machine.pause();
    expect(machine.state.active).toBe(false);
    const resumed = machine.resume();
    expect(resumed?.type).toBe('request');
    if (resumed?.type === 'request') expect(resumed.index).toBe(0);
  });
});
