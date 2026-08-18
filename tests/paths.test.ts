import { describe, expect, it } from 'vitest';
import {
  basename,
  dirname,
  isAbsolutePath,
  normalizeSegments,
  pathRoot,
  pathSuffixes,
  relativeFrom,
  resolvePath,
  resolveStoredPath,
  sameRoot,
  storedPathFor,
} from '../src/core/paths.js';

describe('roots', () => {
  it('recognises posix roots', () => {
    expect(pathRoot('/a/b', 'posix')).toBe('/');
    expect(pathRoot('a/b', 'posix')).toBe('');
    expect(isAbsolutePath('/a', 'posix')).toBe(true);
    expect(isAbsolutePath('a', 'posix')).toBe(false);
  });

  it('recognises windows drive and UNC roots', () => {
    expect(pathRoot('E:\\Basketball', 'win32')).toBe('E:\\');
    expect(pathRoot('e:/Basketball', 'win32')).toBe('e:\\');
    expect(pathRoot('\\\\server\\share\\a', 'win32')).toBe('\\\\server\\share\\');
    expect(pathRoot('Images\\a.png', 'win32')).toBe('');
  });

  it('compares drive letters case-insensitively', () => {
    expect(sameRoot('c:\\a', 'C:\\b', 'win32')).toBe(true);
    expect(sameRoot('C:\\a', 'D:\\b', 'win32')).toBe(false);
  });
});

describe('segment normalisation', () => {
  it('collapses . and ..', () => {
    expect(normalizeSegments(['a', '.', 'b', '..', 'c'])).toEqual(['a', 'c']);
  });

  it('keeps leading .. that cannot be resolved', () => {
    expect(normalizeSegments(['..', '..', 'a'])).toEqual(['..', '..', 'a']);
  });
});

describe('dirname and basename', () => {
  it('works on both styles', () => {
    expect(dirname('/a/b/c.png', 'posix')).toBe('/a/b');
    expect(basename('/a/b/c.png', 'posix')).toBe('c.png');
    expect(dirname('E:\\Basketball\\Basketball.picta', 'win32')).toBe('E:\\Basketball');
    expect(basename('E:\\Basketball\\Images\\bank.png', 'win32')).toBe('bank.png');
  });

  it('handles a file at the root', () => {
    expect(dirname('/a.picta', 'posix')).toBe('/');
    expect(dirname('C:\\a.picta', 'win32')).toBe('C:\\');
  });
});

describe('relative path generation', () => {
  it('stores paths relative to the .picta file with forward slashes', () => {
    const picta = 'E:\\Basketball\\Basketball.picta';
    expect(storedPathFor('E:\\Basketball\\Images\\bank.png', picta, 'win32')).toBe(
      'Images/bank.png',
    );
    expect(storedPathFor('E:\\Basketball\\Images\\pizza.png', picta, 'win32')).toBe(
      'Images/pizza.png',
    );
  });

  it('works the same on posix', () => {
    const picta = '/Users/op/Basketball/Basketball.picta';
    expect(storedPathFor('/Users/op/Basketball/Images/bank.png', picta, 'posix')).toBe(
      'Images/bank.png',
    );
  });

  it('walks up when images live beside the show folder', () => {
    const picta = '/shows/lobby/Lobby.picta';
    expect(storedPathFor('/shows/media/a.png', picta, 'posix')).toBe('../media/a.png');
  });

  it('falls back to an absolute path across drives', () => {
    const picta = 'E:\\Basketball\\Basketball.picta';
    expect(storedPathFor('C:\\Photos\\a.png', picta, 'win32')).toBe('C:/Photos/a.png');
  });

  it('falls back to an absolute path across UNC shares', () => {
    const picta = '\\\\media\\shows\\a.picta';
    expect(storedPathFor('\\\\other\\pics\\b.png', picta, 'win32')).toBe('//other/pics/b.png');
  });
});

describe('relative path resolution', () => {
  it('resolves stored relative paths against the .picta file', () => {
    expect(resolveStoredPath('Images/bank.png', 'E:\\Basketball\\Basketball.picta', 'win32')).toBe(
      'E:\\Basketball\\Images\\bank.png',
    );
    expect(resolveStoredPath('Images/bank.png', '/shows/b/B.picta', 'posix')).toBe(
      '/shows/b/Images/bank.png',
    );
  });

  it('resolves stored absolute paths unchanged', () => {
    expect(resolveStoredPath('C:/Photos/a.png', 'E:\\B\\B.picta', 'win32')).toBe(
      'C:\\Photos\\a.png',
    );
  });

  it('round-trips through a folder move', () => {
    const original = 'E:\\Basketball\\Basketball.picta';
    const stored = storedPathFor('E:\\Basketball\\Images\\bank.png', original, 'win32');
    const moved = 'F:\\Events\\Basketball\\Basketball.picta';
    expect(resolveStoredPath(stored, moved, 'win32')).toBe(
      'F:\\Events\\Basketball\\Images\\bank.png',
    );
  });

  it('survives a move between operating systems', () => {
    const stored = storedPathFor(
      'E:\\Basketball\\Images\\bank.png',
      'E:\\Basketball\\B.picta',
      'win32',
    );
    expect(resolveStoredPath(stored, '/Volumes/USB/Basketball/B.picta', 'posix')).toBe(
      '/Volumes/USB/Basketball/Images/bank.png',
    );
  });
});

describe('relativeFrom', () => {
  it('returns null across roots', () => {
    expect(relativeFrom('C:\\a', 'D:\\b', 'win32')).toBeNull();
  });

  it('is case-insensitive on windows segments', () => {
    expect(relativeFrom('E:\\Basketball', 'E:\\basketball\\Images\\a.png', 'win32')).toBe(
      'Images/a.png',
    );
  });

  it('is case-sensitive on posix segments', () => {
    expect(relativeFrom('/a/B', '/a/b/c.png', 'posix')).toBe('../b/c.png');
  });
});

describe('resolvePath', () => {
  it('handles mixed separators on windows', () => {
    expect(resolvePath('E:\\Show', 'Images/a.png', 'win32')).toBe('E:\\Show\\Images\\a.png');
  });

  it('collapses .. while resolving', () => {
    expect(resolvePath('/a/b', '../c/d.png', 'posix')).toBe('/a/c/d.png');
  });
});

describe('pathSuffixes', () => {
  it('returns trailing segments longest first', () => {
    expect(pathSuffixes('/old/Images/logos/bank.png', 'posix')).toEqual([
      'old/Images/logos/bank.png',
      'Images/logos/bank.png',
      'logos/bank.png',
      'bank.png',
    ]);
  });
});
