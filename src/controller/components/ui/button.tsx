import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Picta buttons are compact desktop controls. Colour carries meaning:
 *   default   neutral raised control
 *   primary   the single recommended action in a region (accent)
 *   live      takes or keeps the audience display ON AIR
 *   cue       starts a temporary takeover of the program
 *   danger    destructive (rarely filled; reads as a warning, not a tally)
 *   ghost     toolbar/icon actions that sit on a surface
 */
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-100 outline-none select-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-40 data-disabled:pointer-events-none data-disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          'border-line-strong bg-raised text-fg hover:bg-raised-hover aria-expanded:bg-raised-hover aria-pressed:bg-raised-hover',
        primary: 'bg-accent text-accent-fg hover:brightness-110',
        live: 'bg-live text-live-fg hover:brightness-110',
        cue: 'border-cue/40 bg-cue-soft text-cue hover:bg-cue/25',
        danger: 'border-danger/35 bg-danger-soft text-danger hover:bg-danger/20',
        ghost:
          'text-fg-muted hover:bg-raised-hover hover:text-fg aria-expanded:bg-raised-hover aria-expanded:text-fg',
        outline: 'border-line-strong bg-transparent text-fg hover:bg-raised-hover',
        link: 'h-auto px-0 text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-7 px-2.5 text-[12px]',
        sm: 'h-6 gap-1 px-2 text-[11.5px] [&_svg:not([class*=size-])]:size-3',
        lg: 'h-8 px-3 text-[13px] [&_svg:not([class*=size-])]:size-4',
        xl: 'h-10 px-4 text-[14px] font-semibold [&_svg:not([class*=size-])]:size-4',
        icon: 'size-7',
        'icon-sm': 'size-6 [&_svg:not([class*=size-])]:size-3',
        'icon-lg': 'size-8 [&_svg:not([class*=size-])]:size-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  type = 'button',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      type={type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
