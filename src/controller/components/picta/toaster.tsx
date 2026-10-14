/**
 * Transient notices: confirmations that offer Undo, and failures. Sonner keeps
 * the toast behaviour (stacking, actions, timers); Cladd's tokens give it the
 * look of a Cladd popover.
 */

import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { CircleCheck, Info, Loader2, OctagonX, TriangleAlert } from 'lucide-react';

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      offset={40}
      gap={6}
      visibleToasts={4}
      icons={{
        success: <CircleCheck className="size-4 text-ok" />,
        info: <Info className="size-4 text-cladd-fg-soft" />,
        warning: <TriangleAlert className="size-4 text-warn" />,
        error: <OctagonX className="size-4 text-danger" />,
        loading: <Loader2 className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            '!rounded-cladd-popover !border-0 !bg-cladd-surface !bg-linear-to-br !from-cladd-surface-highlight !to-cladd-surface !text-cladd-fg !shadow-cladd-popover !shadow-cladd-outline !px-3 !py-2.5 !gap-2.5 !text-cladd-xs !font-medium',
          description: '!text-cladd-fg-soft !text-cladd-xs',
          actionButton:
            '!h-cladd-sm !rounded-cladd-sm !bg-cladd-surface-hover !text-cladd-fg !text-cladd-xs !font-semibold',
        },
      }}
      {...props}
    />
  );
}
