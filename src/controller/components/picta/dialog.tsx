/**
 * Modal dialogs: a Cladd Dialog with Picta's sizes and a footer that is
 * always the same: dismissive action first, the action that proceeds last.
 *
 * Cladd's Dialog traps focus, makes the app inert, closes on Escape and
 * returns focus. Its built-in confirm/cancel buttons are large pills and
 * focus the confirm button, which is wrong for a destructive question, so
 * Picta supplies its own footer through `actions`.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Dialog } from '@cladd-ui/react';
import { cn } from '@/lib/utils';
import { restoreMenuFocus } from '@/lib/focus';

const SIZES = {
  sm: 'w-[22rem]',
  md: 'w-[28rem]',
  lg: 'w-[44rem]',
} as const;

export function ModalDialog({
  open = true,
  onOpenChange,
  title,
  text,
  size = 'md',
  actions,
  className,
  children,
}: {
  open?: boolean;
  /** Called when the dialog is dismissed (Escape, outside click). */
  onOpenChange?(open: boolean): void;
  title: ReactNode;
  /** A sentence of explanation. Also the dialog's accessible description. */
  text?: ReactNode;
  size?: keyof typeof SIZES;
  /** The footer buttons, dismissive first. */
  actions: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  useEffect(() => restoreMenuFocus, []);
  return (
    <Dialog
      open={open}
      {...(onOpenChange ? { onOpenChange } : {})}
      title={title}
      {...(text ? { text } : {})}
      className={cn(SIZES[size], className)}
      contentClassName="gap-3 p-4"
      buttons={actions}
    >
      {children}
    </Dialog>
  );
}

/**
 * Focuses a button once the dialog has opened, so the safest or most likely
 * answer is the one Enter picks. Cladd's trap would otherwise focus the first
 * control in the dialog, and the (focus-restoring) trap must see the opener as
 * the previously focused element, so autoFocus is not an option.
 */
export function useInitialFocus<T extends HTMLElement>(options: { select?: boolean } = {}) {
  const ref = useRef<T | null>(null);
  const select = options.select ?? false;
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        ref.current?.focus();
        if (select && ref.current instanceof HTMLInputElement) ref.current.select();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [select]);
  return ref;
}
