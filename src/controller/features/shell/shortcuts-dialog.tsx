import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Keys } from '@/components/picta/hint';
import { usePicta } from '@/state/store';
import { openShortcuts } from '@/actions/ui';
import { SHORTCUTS, type ShortcutInfo } from '@/shortcuts';

const GROUPS: ShortcutInfo['group'][] = ['Output', 'Score', 'Stats', 'Workspace', 'Show'];

export function ShortcutsDialog() {
  const open = usePicta((state) => state.shortcutsOpen);
  return (
    <Dialog open={open} onOpenChange={(value) => openShortcuts(value)}>
      <DialogContent className="w-[min(640px,calc(100%-32px))] sm:max-w-none">
        <DialogTitle className="text-[14px] font-semibold">Keyboard shortcuts</DialogTitle>
        <p className="-mt-2 text-[12px] text-fg-muted">
          Shortcuts never fire while you are typing, and Space only advances media when no button
          has focus.
        </p>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group}>
              <h3 className="label-caps mb-1.5">{group}</h3>
              <ul className="flex flex-col gap-1">
                {SHORTCUTS.filter((item) => item.group === group).map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-3 text-[12px]"
                  >
                    <span className="text-fg-muted">{item.label}</span>
                    <Keys keys={item.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
