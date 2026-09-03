import { describe, expect, it } from 'vitest';
import { OperationGeneration, runLatestOpen } from '../src/app/document-lifecycle.js';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

describe('transactional document opening', () => {
  it('leaves the current live show untouched when a replacement is invalid', async () => {
    const operations = new OperationGeneration();
    const state = { show: 'current', output: 'live' };
    const outcome = await runLatestOpen(
      operations,
      async () => ({ ok: false as const, message: 'The replacement is invalid.' }),
      (value) => value.ok,
      () => {
        state.output = 'stopped';
        state.show = 'replacement';
      },
    );

    expect(outcome.status).toBe('failed');
    expect(state).toEqual({ show: 'current', output: 'live' });
  });

  it('stops the old output only after a replacement has loaded successfully', async () => {
    const operations = new OperationGeneration();
    const order: string[] = [];
    const outcome = await runLatestOpen(
      operations,
      async () => {
        order.push('loaded');
        return { ok: true as const, show: 'replacement' };
      },
      (value) => value.ok,
      (value) => {
        order.push('stop old output');
        expect(value.show).toBe('replacement');
        order.push('commit new show');
      },
    );

    expect(outcome.status).toBe('committed');
    expect(order).toEqual(['loaded', 'stop old output', 'commit new show']);
  });

  it('lets the newest open win and suppresses a stale failure', async () => {
    const operations = new OperationGeneration();
    const older = deferred<{ ok: boolean; message?: string }>();
    const commits: string[] = [];
    const first = runLatestOpen(
      operations,
      () => older.promise,
      (value) => value.ok,
      () => commits.push('old'),
    );
    const second = runLatestOpen(
      operations,
      async () => ({ ok: true, name: 'newer' }),
      (value) => value.ok,
      () => commits.push('newer'),
    );

    await expect(second).resolves.toMatchObject({ status: 'committed' });
    older.resolve({ ok: false, message: 'old file failed' });
    await expect(first).resolves.toEqual({ status: 'stale' });
    expect(commits).toEqual(['newer']);
  });
});
