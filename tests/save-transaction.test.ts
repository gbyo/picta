import { describe, expect, it, vi } from 'vitest';
import { runSaveTransaction } from '../src/app/save-transaction.js';

describe('Save As transactions', () => {
  it('retains the current path when the picker is cancelled', async () => {
    const write = vi.fn();
    const outcome = await runSaveTransaction('/shows/working.picta', true, async () => null, write);

    expect(outcome).toEqual({ status: 'cancelled', path: '/shows/working.picta' });
    expect(write).not.toHaveBeenCalled();
  });

  it('retains the current path when writing the new path fails', async () => {
    const outcome = await runSaveTransaction(
      '/shows/working.picta',
      true,
      async () => '/shows/new-name.picta',
      async () => ({ ok: false as const, message: 'disk full' }),
    );

    expect(outcome).toEqual({
      status: 'failed',
      path: '/shows/working.picta',
      result: { ok: false, message: 'disk full' },
    });
  });

  it('adopts a new path only after a successful write', async () => {
    const outcome = await runSaveTransaction(
      '/shows/working.picta',
      true,
      async () => '/shows/new-name.picta',
      async () => ({ ok: true as const }),
    );

    expect(outcome).toEqual({
      status: 'saved',
      path: '/shows/new-name.picta',
      result: { ok: true },
    });
  });
});
