import { cn } from '@/lib/utils';

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'pointer-events-none inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-xs border border-line-strong bg-sunken/60 px-1 font-sans text-[11px] leading-none font-medium text-fg-muted select-none [&_svg:not([class*=size-])]:size-2.5',
        className,
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-0.5', className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
