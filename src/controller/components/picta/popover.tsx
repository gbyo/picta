/**
 * Anchored popovers.
 *
 * Cladd's Popover is the right surface for a small, anchored, non-modal task.
 * It positions and dismisses itself (outside click, Escape) but does not move
 * focus. This wrapper adds what a keyboard operator needs: focus moves into
 * the popover when it opens, returns to the trigger when it is dismissed from
 * the keyboard, and the popover is named and exposed as a dialog.
 *
 * Focus is deliberately returned only when it was still inside the popover
 * (Escape, or choosing an item with the keyboard). After a mouse dismissal the
 * operator's click decides where focus goes, so a button just clicked never
 * keeps focus and Space keeps advancing media.
 */

import { cloneElement, useRef, useState, type ReactElement, type ReactNode, type Ref } from 'react';
import { Popover, type PopoverPosition } from '@cladd-ui/react';
import { cn } from '@/lib/utils';

const FOCUSABLE =
  'input:not([disabled]), button:not([disabled]), [role="option"][aria-selected="true"], [tabindex]:not([tabindex="-1"])';

const WIDTHS = { sm: 'w-64', md: 'w-80', lg: 'w-[26rem]' } as const;

interface TriggerProps {
  ref?: Ref<HTMLElement>;
  onClick?(event: React.MouseEvent): void;
}

export function PictaPopover({
  trigger,
  label,
  position = 'bottom-start',
  width = 'md',
  initialFocus,
  className,
  contentClassName,
  children,
}: {
  /** The element that opens the popover. Must accept a ref and onClick (a Cladd Button does). */
  trigger: ReactElement<TriggerProps>;
  /** Accessible name for the popover. */
  label: string;
  position?: PopoverPosition;
  width?: keyof typeof WIDTHS;
  /** Selectors for the element to focus first, in order of preference; defaults to the first control. */
  initialFocus?: string[];
  className?: string;
  contentClassName?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLElement | null>(null);
  const originalRef = trigger.props.ref;
  const originalClick = trigger.props.onClick;

  const setAnchor = (element: HTMLElement | null) => {
    anchor.current = element;
    if (typeof originalRef === 'function') originalRef(element);
    else if (originalRef) (originalRef as { current: HTMLElement | null }).current = element;
  };

  const focusInside = () => {
    const root = content.current;
    if (!root) return;
    const target =
      (initialFocus ?? [])
        .map((selector) => root.querySelector<HTMLElement>(selector))
        .find((element) => element !== null) ?? root.querySelector<HTMLElement>(FOCUSABLE);
    (target ?? root).focus({ preventScroll: true });
  };

  const close = () => setOpen(false);
  const clone = cloneElement(trigger, {
    ref: setAnchor,
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    onClick: (event: React.MouseEvent) => {
      originalClick?.(event);
      setOpen((value) => !value);
    },
  } as TriggerProps);

  return (
    <>
      {clone}
      <Popover
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchor}
        position={position}
        offset={4}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        ref={(element: HTMLElement | null) => {
          content.current = element;
        }}
        onOpen={focusInside}
        onClose={() => {
          // Runs as the close transition begins, while focus is still inside.
          if (content.current?.contains(document.activeElement)) anchor.current?.focus();
        }}
        className={cn(WIDTHS[width], className)}
        contentClassName={cn('max-h-[min(70vh,32rem)] flex-col', contentClassName)}
      >
        {typeof children === 'function' ? children(close) : children}
      </Popover>
    </>
  );
}
