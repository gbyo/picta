import { useEffect } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/picta/resizable';
import { PictaProvider } from '@/components/picta/provider';
import { Toaster } from '@/components/picta/toaster';
import { usePicta } from './state/store';
import { handleGlobalKey } from './shortcuts';
import { TopBar } from './features/shell/top-bar';
import { StatusBar } from './features/shell/status-bar';
import { DialogHost } from './features/shell/dialog-host';
import { CommandPalette } from './features/shell/command-palette';
import { ShortcutsDialog } from './features/shell/shortcuts-dialog';
import { DropOverlay } from './features/shell/drop-overlay';
import { FailureBanner } from './features/shell/failure-banner';
import { ProgramRail } from './features/program/program-rail';
import { ConsoleWorkspace } from './features/console/console-workspace';
import { MediaWorkspace } from './features/media/media-workspace';
import { RosterWorkspace } from './features/roster/roster-workspace';
import { ScreensWorkspace } from './features/screens/screens-workspace';

const RAIL_KEY = 'picta.rail-width';

function storedRailWidth(): number {
  try {
    const value = Number(localStorage.getItem(RAIL_KEY));
    return Number.isFinite(value) && value >= 280 && value <= 560 ? value : 360;
  } catch {
    return 360;
  }
}

function Workspace() {
  const mode = usePicta((state) => state.mode);
  return (
    <main aria-label="Workspace" className="h-full min-h-0 min-w-0 bg-cladd-bg">
      {mode === 'console' && <ConsoleWorkspace />}
      {mode === 'media' && <MediaWorkspace />}
      {mode === 'roster' && <RosterWorkspace />}
      {mode === 'screens' && <ScreensWorkspace />}
    </main>
  );
}

export function App() {
  const theme = usePicta((state) => state.theme);
  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);
  // Like native desktop buttons, a control clicked with the mouse does not keep
  // keyboard focus. Otherwise Space (next media) would re-press the last
  // stat or Point button the operator clicked, or flip the last checkbox.
  // Keyboard focus is untouched.
  useEffect(() => {
    const release = (event: MouseEvent) => {
      if (event.detail === 0) return;
      const target =
        event.target instanceof Element
          ? event.target.closest('button, input[type="checkbox"], input[type="radio"]')
          : null;
      if (!target || target !== document.activeElement) return;
      if (target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'))
        return;
      if (target.hasAttribute('aria-haspopup') || target.closest('form')) return;
      (target as HTMLElement).blur();
    };
    window.addEventListener('click', release);
    return () => window.removeEventListener('click', release);
  }, []);
  // Desktop software: no browser context menu, no accidental text drags.
  useEffect(() => {
    const block = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest('input, textarea')) event.preventDefault();
    };
    window.addEventListener('contextmenu', block);
    return () => window.removeEventListener('contextmenu', block);
  }, []);

  return (
    <PictaProvider theme={theme}>
      <div className="app-container flex h-full flex-col bg-cladd-bg text-cladd-fg">
        <TopBar />
        <FailureBanner />
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel
            id="rail"
            defaultSize={storedRailWidth()}
            minSize={280}
            maxSize={560}
            groupResizeBehavior="preserve-pixel-size"
            onResize={(size) => {
              try {
                localStorage.setItem(RAIL_KEY, String(Math.round(size.inPixels)));
              } catch {
                // Per-machine convenience only.
              }
            }}
          >
            <ProgramRail />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="workspace" minSize={420}>
            <Workspace />
          </ResizablePanel>
        </ResizablePanelGroup>
        <StatusBar />
      </div>
      <DialogHost />
      <CommandPalette />
      <ShortcutsDialog />
      <DropOverlay />
      <Toaster theme={theme} />
    </PictaProvider>
  );
}
