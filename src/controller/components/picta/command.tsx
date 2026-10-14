/**
 * The command palette's list. cmdk keeps the behaviour (filtering, ranking,
 * arrow/Enter handling); the rows are drawn like any other Cladd list so the
 * palette does not look like a different application.
 */

import type { ComponentProps, ReactNode } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Dialog } from '@cladd-ui/react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Keys } from './hint';

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn('flex size-full flex-col overflow-hidden', className)}
      {...props}
    />
  );
}

export function CommandDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      aria-label={title}
      className="w-[36rem]"
      contentClassName="gap-0 p-0"
    >
      {children}
    </Dialog>
  );
}

export function CommandInput(props: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex h-cladd-2xl items-center gap-2 border-b px-3">
      <Search className="size-4 text-cladd-fg-soft" aria-hidden />
      <CommandPrimitive.Input
        className="h-full w-full bg-transparent text-cladd-sm font-medium outline-none placeholder:text-cladd-fg-softer"
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn('max-h-[min(26rem,60vh)] scroll-py-1 overflow-y-auto p-1', className)}
      {...props}
    />
  );
}

export function CommandEmpty(props: ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      className="py-8 text-center text-cladd-xs text-cladd-fg-softer"
      {...props}
    />
  );
}

export function CommandGroup({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        '**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-cladd-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-cladd-fg-soft **:[[cmdk-group-heading]]:uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function CommandItem({
  icon,
  keys,
  className,
  children,
  ...props
}: ComponentProps<typeof CommandPrimitive.Item> & {
  icon?: ReactNode;
  keys?: string[] | undefined;
}) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'relative flex h-cladd-md cursor-default items-center gap-2 rounded-cladd-md px-2 text-cladd-xs font-semibold outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40 data-[selected=true]:bg-cladd-surface-hover [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-cladd-fg-soft',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {keys && <Keys keys={keys} />}
    </CommandPrimitive.Item>
  );
}
