import { Surface } from '@cladd-ui/react';
import { FileDown, Lock } from 'lucide-react';
import { usePicta } from '@/state/store';
import { describeDrop } from '@/boot';

/** Says exactly what dropping the dragged files will do before they land. */
export function DropOverlay() {
  const drag = usePicta((state) => state.fileDrag);
  const live = usePicta((state) => state.output.phase !== 'off');
  if (!drag) return null;
  const description = describeDrop(drag.paths) ?? 'Picta cannot use these files';
  const blocked = description.includes('locked') || description.includes('cannot');
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-cladd-bg/70 p-8">
      <Surface
        level={2}
        variant="gradient"
        outline
        className="rounded-cladd-dialog border-2 border-dashed border-accent/70 shadow-cladd-popover"
        contentClassName="flex flex-col items-center gap-3 px-10 py-8"
      >
        {blocked && live ? (
          <Lock className="size-8 text-warn" />
        ) : (
          <FileDown className="size-8 text-cladd-primary" />
        )}
        <p className="text-cladd-md font-semibold">{description}</p>
        <p className="text-cladd-xs text-cladd-fg-soft">
          {drag.paths.length} file{drag.paths.length === 1 ? '' : 's'}
        </p>
      </Surface>
    </div>
  );
}
