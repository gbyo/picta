/**
 * The running controller: one platform, one output, one store.
 *
 * Created once at startup (outside React, so Strict Mode double-mounting can
 * never create a second output or a second set of native listeners) and
 * replaced wholesale in tests.
 */

import type { OutputHandlers } from '@app/output-controller.js';
import type { OutputPort, Platform } from './platform/types.js';

export interface Runtime {
  platform: Platform;
  output: OutputPort;
}

let current: Runtime | null = null;

export function rt(): Runtime {
  if (!current) throw new Error('The Picta runtime has not been installed.');
  return current;
}

export function hasRuntime(): boolean {
  return current !== null;
}

export function installRuntime(platform: Platform, handlers: OutputHandlers): Runtime {
  current = { platform, output: platform.createOutput(handlers) };
  return current;
}

export function uninstallRuntime(): void {
  current = null;
}
