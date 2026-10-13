/**
 * The real desktop bridge. Every native capability the controller uses passes
 * through here, on top of the narrow Rust commands in `@app/ipc`.
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import * as ipc from '@app/ipc.js';
import { EVENT_KEY, EVENT_MENU } from '@app/events.js';
import { OutputController } from '@app/output-controller.js';
import { MediaPreflightCache } from '@app/media-preflight.js';
import { flushPrefs, readPrefs, writePrefs } from '@app/prefs.js';
import {
  discardRecoverySnapshot,
  readRecoverySnapshot,
  writeRecoverySnapshot,
} from '@app/recovery-io.js';
import {
  chooseFolder,
  chooseMedia,
  chooseMediaSetToOpen,
  chooseMediaSetToSave,
  chooseTeamToOpen,
  chooseTeamToSave,
  openMediaSet,
  openTeam,
  saveMediaSet,
  saveTeam,
} from '@app/resource-io.js';
import {
  chooseShowToOpen,
  chooseShowToSave,
  openShowDocument,
  saveShowDocument,
} from '@app/show-io.js';
import type { PathStyle } from '@core/paths.js';
import type { Platform } from './types.js';

export function createTauriPlatform(): Platform {
  const appWindow = getCurrentWindow();
  const preflight = new MediaPreflightCache();
  return {
    native: true,
    pathStyle: () =>
      ipc
        .pathStyle()
        .catch((): PathStyle => (navigator.userAgent.includes('Windows') ? 'win32' : 'posix')),
    assetUrl: (path) => convertFileSrc(path),
    createOutput: (handlers) => new OutputController(handlers),
    displays: {
      list: () => ipc.listDisplays(),
      identify: () => ipc.identifyDisplays(),
    },
    presentation: {
      prepare: (id) => ipc.preparePresentation(id),
      show: (id) => ipc.showPresentation(id),
      close: () => ipc.closePresentation(),
    },
    files: {
      allowMedia: (paths) => ipc.allowMedia(paths),
      pathsExist: (paths) => ipc.pathsExist(paths),
      reveal: (path) => ipc.revealPath(path),
      startupFile: () => ipc.startupFile(),
      openShow: openShowDocument,
      saveShow: saveShowDocument,
      openMediaSet,
      saveMediaSet,
      openTeam,
      saveTeam,
    },
    dialogs: {
      chooseMedia,
      chooseFolder,
      chooseShowToOpen,
      chooseShowToSave,
      chooseTeamToOpen,
      chooseTeamToSave,
      chooseMediaSetToOpen,
      chooseMediaSetToSave,
    },
    preflight: {
      check: (items) => preflight.check(items),
      invalidate: (paths) => preflight.clear(paths),
    },
    prefs: { read: readPrefs, write: writePrefs, flush: flushPrefs },
    recovery: {
      read: readRecoverySnapshot,
      write: writeRecoverySnapshot,
      discard: discardRecoverySnapshot,
    },
    updates: {
      check: () => ipc.checkForUpdate(),
      openReleases: () => ipc.openReleasesPage(),
    },
    window: {
      setTitle: (title) => appWindow.setTitle(title),
      reveal: async () => {
        await appWindow.show();
        await appWindow.setFocus();
      },
      geometry: async () => {
        try {
          const size = await appWindow.innerSize();
          const position = await appWindow.outerPosition();
          return { width: size.width, height: size.height, x: position.x, y: position.y };
        } catch {
          return null;
        }
      },
      restoreGeometry: async (geometry, displays) => {
        try {
          await appWindow.setSize(new PhysicalSize(geometry.width, geometry.height));
          // Only restore a position that is still on a connected display.
          const visible = displays.some(
            (display) =>
              geometry.x + 80 >= display.x &&
              geometry.y + 40 >= display.y &&
              geometry.x < display.x + display.width &&
              geometry.y < display.y + display.height,
          );
          if (visible) await appWindow.setPosition(new PhysicalPosition(geometry.x, geometry.y));
        } catch {
          // Default geometry is always acceptable.
        }
      },
      quit: () => ipc.quitApp(),
    },
    events: {
      onMenu: (handler) => listen<string>(EVENT_MENU, (event) => handler(event.payload)),
      onPresentationKey: (handler) =>
        listen<{ key: string }>(EVENT_KEY, (event) => handler(event.payload.key)),
      onFileDrag: (handler) =>
        getCurrentWebviewWindow().onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === 'enter') handler({ type: 'enter', paths: payload.paths });
          else if (payload.type === 'over') handler({ type: 'over' });
          else if (payload.type === 'drop') handler({ type: 'drop', paths: payload.paths });
          else handler({ type: 'leave' });
        }),
      onCloseRequested: (handler) =>
        appWindow.onCloseRequested(async (event) => {
          event.preventDefault();
          await handler();
        }),
    },
  };
}
