import { useMemo, useState } from 'react';
import { Button, Input } from '@cladd-ui/react';
import { parseRosterText } from '@core/roster-import.js';
import { ActionButton } from '@/components/picta/controls';
import { ModalDialog } from '@/components/picta/dialog';
import { SectionHeader } from '@/components/picta/workspace';
import { Banner } from '@/components/picta/feedback';
import { useDefinition } from '@/hooks';
import { importRoster } from '@/actions/team';

/** Paste a roster from a spreadsheet or email, see exactly what will be added, then add it. */
export function PasteRosterDialog({ onClose }: { onClose(): void }) {
  const definition = useDefinition();
  const [text, setText] = useState('');
  const parsed = useMemo(
    () => parseRosterText(text, definition?.positions ?? []),
    [text, definition],
  );
  const close = onClose;
  return (
    <ModalDialog
      onOpenChange={(value) => !value && close()}
      title="Paste roster"
      text="One player per line: number, name and optional position, separated by spaces, commas or tabs."
      size="lg"
      actions={
        <>
          <Button onClick={close}>Cancel</Button>
          <ActionButton
            intent="primary"
            disabled={parsed.players.length === 0}
            onClick={() => {
              importRoster(text);
              close();
            }}
          >
            Add {parsed.players.length || ''} Player{parsed.players.length === 1 ? '' : 's'}
          </ActionButton>
        </>
      }
    >
      <div className="grid min-h-0 grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <SectionHeader label="Roster text" />
          <Input
            inputComponent="textarea"
            value={text}
            onChange={setText}
            placeholder={'7 Avery Chen OH\n12, Hannah Brooks, Outside Hitter\n2\tMaya Okafor\tS'}
            inputClassName="h-64 resize-none py-2 font-mono"
            inputComponentProps={{ 'aria-label': 'Roster text', spellCheck: false }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <SectionHeader label="Preview" />
          <div className="h-64 overflow-y-auto rounded-cladd-md bg-cladd-surface-cut">
            <table className="w-full text-cladd-xs">
              <thead className="sticky top-0 bg-cladd-surface-cut text-cladd-xs tracking-wider text-cladd-fg-soft uppercase">
                <tr>
                  <th className="w-12 px-2 py-1.5 text-right font-medium">#</th>
                  <th className="px-2 py-1.5 text-left font-medium">Name</th>
                  <th className="px-2 py-1.5 text-left font-medium">Pos.</th>
                </tr>
              </thead>
              <tbody>
                {parsed.players.map((player, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-2 py-1 text-right font-semibold tabular">{player.number}</td>
                    <td className="px-2 py-1">{player.name}</td>
                    <td className="px-2 py-1 text-cladd-fg-soft">{player.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.players.length === 0 && (
              <p className="px-3 py-6 text-center text-cladd-fg-softer">A preview appears here.</p>
            )}
          </div>
        </div>
      </div>
      {parsed.skipped.length > 0 && (
        <Banner tone="warn" variant="inline">
          Skipping {parsed.skipped.length} line(s) that are not players.
        </Banner>
      )}
    </ModalDialog>
  );
}
