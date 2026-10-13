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
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-canvas/70 p-8">
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-accent/70 bg-overlay px-10 py-8 shadow-pop">
        {blocked && live ? (
          <Lock className="size-8 text-warn" />
        ) : (
          <FileDown className="size-8 text-accent" />
        )}
        <p className="text-[15px] font-semibold text-fg">{description}</p>
        <p className="text-[12px] text-fg-muted">
          {drag.paths.length} file{drag.paths.length === 1 ? '' : 's'}
        </p>
      </div>
    </div>
  );
}
