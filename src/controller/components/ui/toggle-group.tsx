import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { cn } from '@/lib/utils';

/**
 * A segmented control. Base UI's ToggleGroup gives the keyboard and pressed
 * semantics; Picta draws it as one sunken track with a raised selection.
 */
function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn(
        'inline-flex h-7 items-stretch gap-px rounded-md border border-line bg-sunken/70 p-0.5',
        className,
      )}
      {...props}
    />
  );
}

function ToggleGroupItem({ className, ...props }: TogglePrimitive.Props) {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex min-w-7 items-center justify-center gap-1.5 rounded-[4px] px-2 text-[11.5px] font-medium text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent data-pressed:bg-raised data-pressed:text-fg data-pressed:shadow-[0_0_0_1px_var(--line-strong)] disabled:opacity-40 data-disabled:opacity-40 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
