import {
  ChevronDown,
  Command,
  FilePlus2,
  FolderOpen,
  FolderSearch,
  Keyboard,
  Moon,
  RefreshCw,
  Save,
  Sun,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Hint } from '@/components/picta/hint';
import { cn } from '@/lib/utils';
import { usePicta } from '@/state/store';
import { anyDirty, dirtyNames, showTitle } from '@/state/derive';
import { newShow, openShow, reveal, saveShow } from '@/actions/document';
import { openPalette, openShortcuts, setMode, setTheme } from '@/actions/ui';
import { checkForUpdates } from '@/boot';
import { mod } from '@/shortcuts';
import { DisplayPicker } from './display-picker';
import { MODES } from './modes';
import { OutputControl } from './output-control';

function ShowMenu() {
  const title = usePicta((state) => showTitle(state.doc, state.pathStyle));
  const dirty = usePicta((state) => anyDirty(state.doc));
  const unsaved = usePicta((state) => dirtyNames(state.doc, state.pathStyle).join(', '));
  const hasPath = usePicta((state) => state.doc.show.filePath !== null);
  const theme = usePicta((state) => state.theme);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-8 max-w-64 gap-1.5 px-2 text-[13px] font-semibold text-fg"
            aria-label={`Show: ${title}${dirty ? ' (unsaved changes)' : ''}`}
          />
        }
      >
        <span className="truncate">{title}</span>
        {dirty && (
          <span className="size-1.5 shrink-0 rounded-full bg-warn" title={`Unsaved: ${unsaved}`} />
        )}
        <ChevronDown className="size-3 text-fg-faint" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="start">
        <DropdownMenuItem onClick={() => void newShow()}>
          <FilePlus2 />
          New Show
          <DropdownMenuShortcut>{mod}N</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void openShow()}>
          <FolderOpen />
          Open Show…
          <DropdownMenuShortcut>{mod}O</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void saveShow()}>
          <Save />
          Save
          <DropdownMenuShortcut>{mod}S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void saveShow(true)}>
          <Save />
          Save As…
          <DropdownMenuShortcut>⇧{mod}S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasPath} onClick={() => void reveal('show')}>
          <FolderSearch />
          Reveal Show File
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun /> : <Moon />}
          {theme === 'dark' ? 'Light Appearance' : 'Dark Appearance'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openShortcuts()}>
          <Keyboard />
          Keyboard Shortcuts
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void checkForUpdates(true)}>
          <RefreshCw />
          Check for Updates…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModeSwitcher() {
  const mode = usePicta((state) => state.mode);
  return (
    <nav
      aria-label="Workspaces"
      className="flex h-8 items-center gap-0.5 rounded-md bg-sunken/70 p-0.5"
    >
      {MODES.map((item) => {
        const active = item.id === mode;
        return (
          <Hint key={item.id} label={item.hint} keys={[mod, item.key]} side="bottom">
            <button
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setMode(item.id)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent',
                active
                  ? 'bg-raised text-fg shadow-[0_0_0_1px_var(--line-strong)]'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              <item.icon className="size-3.5" />
              <span className="max-[900px]:hidden">{item.label}</span>
            </button>
          </Hint>
        );
      })}
    </nav>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="size-[18px] shrink-0">
      <rect
        x="1"
        y="3"
        width="18"
        height="12"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <rect x="4" y="6" width="6" height="6" rx="1" fill="currentColor" />
      <path d="M7 18h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function TopBar() {
  const live = usePicta((state) => state.output.phase === 'live');
  return (
    <header
      className={cn(
        'relative z-20 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3',
        live && 'before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-live',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className={cn('text-fg-muted', live && 'text-live')}>
          <Mark />
        </span>
        <ShowMenu />
      </div>
      <ModeSwitcher />
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <Hint label="Search commands, players and Screens" keys={[mod, 'K']} side="bottom">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Command palette"
            onClick={() => openPalette()}
          >
            <Command />
          </Button>
        </Hint>
        <DisplayPicker />
        <div className="mx-1 h-6 w-px bg-line" />
        <OutputControl />
      </div>
    </header>
  );
}
