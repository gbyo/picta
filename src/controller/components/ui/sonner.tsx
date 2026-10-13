import { Toaster as Sonner, type ToasterProps } from 'sonner';
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-react';

/** Transient notices: confirmations that offer Undo, and failures. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      offset={40}
      gap={6}
      visibleToasts={4}
      icons={{
        success: <CircleCheckIcon className="size-4 text-ok" />,
        info: <InfoIcon className="size-4 text-fg-muted" />,
        warning: <TriangleAlertIcon className="size-4 text-warn" />,
        error: <OctagonXIcon className="size-4 text-danger" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            '!bg-overlay !text-fg !border-line-strong !shadow-pop !rounded-lg !text-[12.5px] !py-2.5 !px-3 !gap-2.5',
          description: '!text-fg-muted !text-[12px]',
          actionButton:
            '!bg-raised !text-fg !border !border-line-strong !h-6 !rounded-md !text-[11.5px] !font-medium',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
