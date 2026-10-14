import { Button, SectionTitle } from '@cladd-ui/react';
import { Keys } from '@/components/picta/hint';
import { ModalDialog } from '@/components/picta/dialog';
import { usePicta } from '@/state/store';
import { openShortcuts } from '@/actions/ui';
import { SHORTCUTS, type ShortcutInfo } from '@/shortcuts';

const GROUPS: ShortcutInfo['group'][] = ['Output', 'Score', 'Stats', 'Workspace', 'Show'];

export function ShortcutsDialog() {
  const open = usePicta((state) => state.shortcutsOpen);
  return (
    <ModalDialog
      open={open}
      onOpenChange={(value) => openShortcuts(value)}
      title="Keyboard shortcuts"
      text="Shortcuts never fire while you are typing, and Space only advances media when no button has focus."
      size="lg"
      actions={<Button onClick={() => openShortcuts(false)}>Close</Button>}
    >
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group} className="flex flex-col gap-1">
            <SectionTitle>{group}</SectionTitle>
            <ul className="flex flex-col gap-1">
              {SHORTCUTS.filter((item) => item.group === group).map((item) => (
                <li
                  key={item.label}
                  className="flex min-h-cladd-sm items-center justify-between gap-3 text-cladd-xs"
                >
                  <span className="text-cladd-fg-soft">{item.label}</span>
                  <Keys keys={item.keys} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ModalDialog>
  );
}
