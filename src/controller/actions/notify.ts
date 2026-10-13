/**
 * Operator notices. Everything is written to the activity log (the status
 * bar's history); errors, warnings and undoable changes also raise a toast.
 * Nothing here is ever shown on the audience display.
 */

import { toast } from 'sonner';
import { logActivity } from '../state/store.js';

export interface UndoOption {
  label?: string;
  run(): void;
}

export const notify = {
  info(text: string): void {
    logActivity('info', text);
  },
  success(text: string, undo?: UndoOption): void {
    logActivity('success', text);
    if (undo)
      toast.success(text, {
        action: { label: undo.label ?? 'Undo', onClick: () => undo.run() },
        duration: 6000,
      });
  },
  /** A reversible change worth confirming, with an Undo button. */
  undoable(text: string, undo: UndoOption): void {
    logActivity('info', text);
    toast(text, {
      action: { label: undo.label ?? 'Undo', onClick: () => undo.run() },
      duration: 7000,
    });
  },
  warning(text: string): void {
    logActivity('warning', text);
    toast.warning(text, { duration: 7000 });
  },
  error(text: string, detail?: string): void {
    logActivity('error', detail ? `${text} ${detail}` : text);
    toast.error(text, detail ? { description: detail, duration: 10000 } : { duration: 10000 });
  },
};
