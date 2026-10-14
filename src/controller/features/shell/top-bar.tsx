import { Button, Segmented, SegmentedButton } from '@cladd-ui/react';
import {
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
import { Hint } from '@/components/picta/hint';
import { Panel } from '@/components/picta/workspace';
import { ResourceMenu, type ResourceAction } from '@/components/picta/resource-menu';
import { cn } from '@/lib/utils';
import { usePicta } from '@/state/store';
import { anyDirty, dirtyNames, showTitle } from '@/state/derive';
import { newShow, openShow, reveal, saveShow } from '@/actions/document';
import { openPalette, openShortcuts, setMode, setTheme } from '@/actions/ui';
import { checkForUpdates } from '@/boot';
import { modKey } from '@/shortcuts';
import { DisplayPicker } from './display-picker';
import { MODES } from './modes';
import { OutputControl } from './output-control';

function ShowMenu() {
  const title = usePicta((state) => showTitle(state.doc, state.pathStyle));
  const dirty = usePicta((state) => anyDirty(state.doc));
  const unsaved = usePicta((state) => dirtyNames(state.doc, state.pathStyle).join(', '));
  const hasPath = usePicta((state) => state.doc.show.filePath !== null);
  const theme = usePicta((state) => state.theme);
  const groups: ResourceAction[][] = [
    [
      {
        id: 'new',
        label: 'New Show',
        icon: FilePlus2,
        keys: [modKey, 'N'],
        onSelect: () => void newShow(),
      },
      {
        id: 'open',
        label: 'Open Show…',
        icon: FolderOpen,
        keys: [modKey, 'O'],
        onSelect: () => void openShow(),
      },
    ],
    [
      {
        id: 'save',
        label: 'Save',
        icon: Save,
        keys: [modKey, 'S'],
        onSelect: () => void saveShow(),
      },
      {
        id: 'save-as',
        label: 'Save As…',
        icon: Save,
        keys: ['⇧', modKey, 'S'],
        onSelect: () => void saveShow(true),
      },
      {
        id: 'reveal',
        label: 'Reveal Show File',
        icon: FolderSearch,
        disabled: !hasPath,
        onSelect: () => void reveal('show'),
      },
    ],
    [
      {
        id: 'theme',
        label: theme === 'dark' ? 'Light Appearance' : 'Dark Appearance',
        icon: theme === 'dark' ? Sun : Moon,
        onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'shortcuts',
        label: 'Keyboard Shortcuts',
        icon: Keyboard,
        keys: ['?'],
        onSelect: () => openShortcuts(),
      },
      {
        id: 'updates',
        label: 'Check for Updates…',
        icon: RefreshCw,
        onSelect: () => void checkForUpdates(true),
      },
    ],
  ];
  return (
    <ResourceMenu
      name={title}
      dirty={dirty}
      unsavedLabel={`Unsaved: ${unsaved}`}
      ariaLabel={`Show: ${title}${dirty ? ' (unsaved changes)' : ''}`}
      groups={groups}
    />
  );
}

function ModeSwitcher() {
  const mode = usePicta((state) => state.mode);
  return (
    <Segmented as="nav" aria-label="Workspaces" className="gap-0.5">
      {MODES.map((item) => {
        const active = item.id === mode;
        return (
          <Hint key={item.id} label={item.hint} keys={[modKey, item.key]} side="bottom">
            <SegmentedButton
              active={active}
              readOnly={false}
              aria-current={active ? 'page' : undefined}
              onClick={() => setMode(item.id)}
            >
              <item.icon />
              <span className="max-[900px]:hidden">{item.label}</span>
            </SegmentedButton>
          </Hint>
        );
      })}
    </Segmented>
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

/**
 * Quiet and stable: the same few things in the same places until something
 * operationally important happens, when only the live tally changes.
 */
export function TopBar() {
  const live = usePicta((state) => state.output.phase === 'live');
  return (
    <Panel
      as="header"
      row
      className={cn(
        'relative z-20 h-cladd-2xl shrink-0 border-b',
        live &&
          'before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-0.5 before:bg-live',
      )}
      contentClassName="gap-3 px-3"
    >
      <div className="flex min-w-0 flex-1 basis-0 items-center gap-1.5">
        <span className={cn('shrink-0 text-cladd-fg-soft', live && 'text-live')}>
          <Mark />
        </span>
        <ShowMenu />
      </div>
      <ModeSwitcher />
      <div className="flex shrink-0 items-center justify-end gap-2 whitespace-nowrap">
        <Hint label="Search commands, players and Screens" keys={[modKey, 'K']} side="bottom">
          <Button
            square
            variant="transparent"
            outline={false}
            aria-label="Command palette"
            onClick={() => openPalette()}
          >
            <Command />
          </Button>
        </Hint>
        <DisplayPicker />
        <div className="mx-1 h-5 w-px bg-cladd-outline" />
        <OutputControl />
      </div>
    </Panel>
  );
}
