import { describe, expect, it } from 'vitest';
import { AdvanceTimer, createFakeTimerHost } from '../src/core/scheduler.js';

describe('advance timer', () => {
  it('fires once per interval', () => {
    const host = createFakeTimerHost();
    let fired = 0;
    const timer = new AdvanceTimer(host, 10_000, () => {
      fired += 1;
      timer.restart();
    });
    timer.restart();

    host.advance(9_999);
    expect(fired).toBe(0);
    host.advance(1);
    expect(fired).toBe(1);
    host.advance(10_000);
    expect(fired).toBe(2);
  });

  it('gives a manually chosen image a full fresh interval', () => {
    const host = createFakeTimerHost();
    let fired = 0;
    const timer = new AdvanceTimer(host, 10_000, () => {
      fired += 1;
    });
    timer.restart();

    // Operator presses Next after 7 seconds; the new image restarts the clock.
    host.advance(7_000);
    timer.restart();

    host.advance(9_999);
    expect(fired).toBe(0);
    host.advance(1);
    expect(fired).toBe(1);
  });

  it('does not fire after being cancelled', () => {
    const host = createFakeTimerHost();
    let fired = 0;
    const timer = new AdvanceTimer(host, 5_000, () => {
      fired += 1;
    });
    timer.restart();
    timer.cancel();
    host.advance(60_000);
    expect(fired).toBe(0);
    expect(timer.running).toBe(false);
  });

  it('leaves no timer handle behind', () => {
    const host = createFakeTimerHost();
    const timer = new AdvanceTimer(host, 1_000, () => undefined);
    timer.restart();
    timer.restart();
    timer.restart();
    expect(host.pending).toBe(1);
    timer.cancel();
    expect(host.pending).toBe(0);
  });

  it('restarts when the interval changes mid-show', () => {
    const host = createFakeTimerHost();
    let fired = 0;
    const timer = new AdvanceTimer(host, 10_000, () => {
      fired += 1;
    });
    timer.restart();
    host.advance(8_000);
    timer.setInterval(3_000);
    host.advance(2_999);
    expect(fired).toBe(0);
    host.advance(1);
    expect(fired).toBe(1);
  });

  it('does not start a countdown when the interval changes while stopped', () => {
    const host = createFakeTimerHost();
    let fired = 0;
    const timer = new AdvanceTimer(host, 10_000, () => {
      fired += 1;
    });
    timer.setInterval(1_000);
    host.advance(60_000);
    expect(fired).toBe(0);
  });

  it('survives thousands of transitions without accumulating handles', () => {
    const host = createFakeTimerHost();
    let fired = 0;
    const timer = new AdvanceTimer(host, 1_000, () => {
      fired += 1;
      timer.restart();
    });
    timer.restart();
    for (let i = 0; i < 5_000; i += 1) host.advance(1_000);
    expect(fired).toBe(5_000);
    expect(host.pending).toBe(1);
  });
});
