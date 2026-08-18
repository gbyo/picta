import { describe, expect, it } from 'vitest';
import { applyRelink, planRelink, relinkCandidates } from '../src/core/relink.js';

describe('relink candidates', () => {
  it('offers the longest trailing match first', () => {
    expect(relinkCandidates('/old/Images/logos/bank.png', '/new', 'posix')).toEqual([
      '/new/old/Images/logos/bank.png',
      '/new/Images/logos/bank.png',
      '/new/logos/bank.png',
      '/new/bank.png',
    ]);
  });

  it('works with windows paths and folders', () => {
    expect(relinkCandidates('E:\\Basketball\\Images\\bank.png', 'F:\\Moved', 'win32')).toEqual([
      'F:\\Moved\\Basketball\\Images\\bank.png',
      'F:\\Moved\\Images\\bank.png',
      'F:\\Moved\\bank.png',
    ]);
  });
});

describe('relinking a folder that moved wholesale', () => {
  const missing = [
    { index: 0, path: 'E:\\Basketball\\Images\\bank.png' },
    { index: 1, path: 'E:\\Basketball\\Images\\pizza.png' },
    { index: 2, path: 'E:\\Basketball\\Images\\school.png' },
  ];

  it('resolves every file from a single chosen folder', () => {
    const onDisk = new Set([
      'D:\\USB\\Basketball\\Images\\bank.png',
      'D:\\USB\\Basketball\\Images\\pizza.png',
      'D:\\USB\\Basketball\\Images\\school.png',
    ]);
    const plans = planRelink(missing, 'D:\\USB', 'win32');
    const resolved = applyRelink(plans, (p) => onDisk.has(p));
    expect(resolved).toEqual([
      { index: 0, path: 'D:\\USB\\Basketball\\Images\\bank.png' },
      { index: 1, path: 'D:\\USB\\Basketball\\Images\\pizza.png' },
      { index: 2, path: 'D:\\USB\\Basketball\\Images\\school.png' },
    ]);
  });

  it('resolves against the images folder itself', () => {
    const onDisk = new Set(['D:\\Pics\\bank.png', 'D:\\Pics\\pizza.png', 'D:\\Pics\\school.png']);
    const plans = planRelink(missing, 'D:\\Pics', 'win32');
    expect(applyRelink(plans, (p) => onDisk.has(p)).length).toBe(3);
  });

  it('returns only what it could find', () => {
    const onDisk = new Set(['D:\\Pics\\bank.png']);
    const plans = planRelink(missing, 'D:\\Pics', 'win32');
    const resolved = applyRelink(plans, (p) => onDisk.has(p));
    expect(resolved).toEqual([{ index: 0, path: 'D:\\Pics\\bank.png' }]);
  });

  it('returns nothing when the folder is unrelated', () => {
    const plans = planRelink(missing, 'D:\\Empty', 'win32');
    expect(applyRelink(plans, () => false)).toEqual([]);
  });

  it('prefers the deeper match when the same file name appears twice', () => {
    const onDisk = new Set(['/new/logos/bank.png', '/new/bank.png']);
    const plans = planRelink([{ index: 0, path: '/old/logos/bank.png' }], '/new', 'posix');
    const resolved = applyRelink(plans, (p) => onDisk.has(p));
    expect(resolved[0]?.path).toBe('/new/logos/bank.png');
  });

  it('keeps original list positions so playback order is preserved', () => {
    const onDisk = new Set(['/new/b.png', '/new/c.png']);
    const plans = planRelink(
      [
        { index: 3, path: '/old/b.png' },
        { index: 7, path: '/old/c.png' },
      ],
      '/new',
      'posix',
    );
    expect(applyRelink(plans, (p) => onDisk.has(p)).map((r) => r.index)).toEqual([3, 7]);
  });
});
