import { useMemo, useState } from 'react';
import { parseRosterText } from '@core/roster-import.js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDefinition } from '@/hooks';
import { importRoster } from '@/actions/team';

/** Paste a roster from a spreadsheet or email, see exactly what will be added, then add it. */
export function PasteRosterDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const definition = useDefinition();
  const [text, setText] = useState('');
  const parsed = useMemo(
    () => parseRosterText(text, definition?.positions ?? []),
    [text, definition],
  );
  const close = () => {
    setText('');
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(value) => (value ? onOpenChange(true) : close())}>
      <DialogContent
        className="w-[min(720px,calc(100%-32px))] sm:max-w-none"
        showCloseButton={false}
      >
        <div>
          <DialogTitle className="text-[14px] font-semibold">Paste roster</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] text-fg-muted">
            One player per line: number, name and optional position, separated by spaces, commas or
            tabs.
          </DialogDescription>
        </div>
        <div className="grid min-h-0 grid-cols-2 gap-3">
          <Textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            placeholder={'7 Avery Chen OH\n12, Hannah Brooks, Outside Hitter\n2\tMaya Okafor\tS'}
            aria-label="Roster text"
            className="h-64 resize-none font-mono text-[12px]"
          />
          <ScrollArea className="h-64 rounded-md border border-line bg-sunken/40">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-surface text-[10.5px] tracking-[0.06em] text-fg-faint uppercase">
                <tr>
                  <th className="w-12 px-2 py-1.5 text-right font-semibold">#</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Name</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Pos.</th>
                </tr>
              </thead>
              <tbody>
                {parsed.players.map((player, index) => (
                  <tr key={index} className="border-t border-line">
                    <td className="px-2 py-1 text-right font-semibold text-fg tabular">
                      {player.number}
                    </td>
                    <td className="px-2 py-1 text-fg">{player.name}</td>
                    <td className="px-2 py-1 text-fg-muted">{player.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.players.length === 0 && (
              <p className="px-3 py-6 text-center text-fg-faint">A preview appears here.</p>
            )}
          </ScrollArea>
        </div>
        {parsed.skipped.length > 0 && (
          <p className="text-[11.5px] text-warn">
            Skipping {parsed.skipped.length} line(s) that are not players.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={parsed.players.length === 0}
            onClick={() => {
              importRoster(text);
              close();
            }}
          >
            Add {parsed.players.length || ''} Player{parsed.players.length === 1 ? '' : 's'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
