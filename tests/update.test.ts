import { describe, expect, it } from 'vitest';
import {
  UPDATE_CHECK_INTERVAL_MS,
  shouldCheckNow,
  shouldNotify,
  updateNoticeText,
  type UpdateCheckState,
  type UpdateStatus,
} from '../src/core/update.js';

const DAY = UPDATE_CHECK_INTERVAL_MS;
const state = (over: Partial<UpdateCheckState> = {}): UpdateCheckState => ({
  enabled: true,
  lastCheck: null,
  dismissedVersion: null,
  ...over,
});
const idle = { running: false };

describe('when to check', () => {
  it('checks at launch when nothing has been recorded', () => {
    expect(shouldCheckNow(state(), 1_000_000, idle)).toBe(true);
  });

  it('checks again once a day has passed', () => {
    expect(shouldCheckNow(state({ lastCheck: 0 }), DAY - 1, idle)).toBe(false);
    expect(shouldCheckNow(state({ lastCheck: 0 }), DAY, idle)).toBe(true);
    expect(shouldCheckNow(state({ lastCheck: 0 }), DAY * 7, idle)).toBe(true);
  });

  it('never checks while a show is running', () => {
    expect(shouldCheckNow(state(), 1_000_000, { running: true })).toBe(false);
    expect(shouldCheckNow(state({ lastCheck: 0 }), DAY * 7, { running: true })).toBe(false);
  });

  it('never checks when the operator has switched it off', () => {
    expect(shouldCheckNow(state({ enabled: false }), 1_000_000, idle)).toBe(false);
    expect(shouldCheckNow(state({ enabled: false, lastCheck: 0 }), DAY * 7, idle)).toBe(false);
  });

  it('recovers from a nonsense stored timestamp rather than never checking again', () => {
    expect(shouldCheckNow(state({ lastCheck: Number.NaN }), 1_000, idle)).toBe(true);
    // A machine whose clock was wrong and has since been corrected.
    expect(shouldCheckNow(state({ lastCheck: 9_999_999_999_999 }), 1_000, idle)).toBe(true);
  });
});

describe('whether to say anything', () => {
  const status: UpdateStatus = {
    available: true,
    currentVersion: '1.0.0',
    latestVersion: '1.1.0',
    url: 'https://github.com/gbyo/picta/releases/latest',
  };

  it('notifies about a newer version', () => {
    expect(shouldNotify(status, null)).toBe(true);
  });

  it('stays quiet when already up to date', () => {
    expect(shouldNotify({ ...status, available: false, latestVersion: '1.0.0' }, null)).toBe(false);
  });

  it('stays quiet when the check failed', () => {
    expect(shouldNotify({ ...status, available: false, latestVersion: null }, null)).toBe(false);
  });

  it('mentions a version only once', () => {
    expect(shouldNotify(status, '1.1.0')).toBe(false);
  });

  it('still mentions a later version after an earlier one was dismissed', () => {
    expect(shouldNotify({ ...status, latestVersion: '1.2.0' }, '1.1.0')).toBe(true);
  });
});

describe('notice text', () => {
  it('names both versions plainly', () => {
    expect(
      updateNoticeText({
        available: true,
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        url: '',
      }),
    ).toBe('Picta 1.1.0 is available. You are running 1.0.0.');
  });
});
