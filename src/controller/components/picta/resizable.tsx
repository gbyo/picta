/** Resizable regions. react-resizable-panels owns the drag behaviour; the divider is drawn here. */

import * as ResizablePrimitive from 'react-resizable-panels';
import { cn } from '@/lib/utils';

export function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      className={cn('flex h-full w-full aria-[orientation=vertical]:flex-col', className)}
      {...props}
    />
  );
}

export function ResizablePanel(props: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel {...props} />;
}

export function ResizableHandle({ className, ...props }: ResizablePrimitive.SeparatorProps) {
  return (
    <ResizablePrimitive.Separator
      className={cn(
        'relative flex w-px shrink-0 bg-cladd-outline transition-colors outline-none after:absolute after:inset-y-0 after:-left-1 after:-right-1 hover:bg-accent/60 focus-visible:bg-accent',
        className,
      )}
      {...props}
    />
  );
}
