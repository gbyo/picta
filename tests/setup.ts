// Shared test setup. DOM matchers and browser shims are registered only where
// a DOM exists, so the pure core suites keep running in plain node.
import { afterEach } from 'vitest';

if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());

  // jsdom omits a few layout APIs that Base UI, dnd-kit and the panels use.
  class ResizeObserverShim {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  const g = globalThis as Record<string, unknown>;
  g['ResizeObserver'] ??= ResizeObserverShim;
  g['IntersectionObserver'] ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): unknown[] {
      return [];
    }
  };
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
  Element.prototype.getAnimations ??= function getAnimations() {
    return [];
  };
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.setPointerCapture ??= () => undefined;
  HTMLElement.prototype.releasePointerCapture ??= () => undefined;
  HTMLMediaElement.prototype.load = function load() {};
  HTMLMediaElement.prototype.pause = function pause() {};
}
