/**
 * How Picta says things: banners for state that needs attention, empty states
 * for regions with nothing in them, and the dot that colours a status.
 */

import type { ReactNode } from 'react';
import { Surface } from '@cladd-ui/react';
import { CircleAlert, CircleCheck, Info, Lock, OctagonX, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Tone = 'info' | 'ok' | 'warn' | 'danger' | 'live' | 'cue';

const TONE_ICON: Record<Tone, LucideIcon> = {
  info: Info,
  ok: CircleCheck,
  warn: CircleAlert,
  danger: OctagonX,
  live: Lock,
  cue: Info,
};

const TONE_TEXT: Record<Tone, string> = {
  info: 'text-cladd-fg-soft',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  live: 'text-live',
  cue: 'text-cue',
};

/**
 * A status message. `bar` runs edge to edge under a header; `inline` is a
 * tinted block inside a panel. Colour is meaning: `live` is only for things
 * that are true because the output is ON AIR, `danger` for failures.
 */
export function Banner({
  tone = 'info',
  variant = 'bar',
  icon,
  actions,
  role,
  className,
  children,
}: {
  tone?: Tone;
  variant?: 'bar' | 'inline';
  icon?: LucideIcon | false;
  actions?: ReactNode;
  role?: 'alert' | 'status';
  className?: string;
  children: ReactNode;
}) {
  const Icon = icon === false ? null : (icon ?? TONE_ICON[tone]);
  return (
    <Surface
      role={role}
      color={tone === 'info' ? 'neutral' : tone}
      variant="solid"
      level={variant === 'bar' ? 1 : '+1'}
      className={cn(
        'shrink-0 text-cladd-xs',
        variant === 'bar' ? 'border-b' : 'rounded-cladd-md',
        className,
      )}
      contentClassName="flex items-center gap-2 px-3 py-1.5"
    >
      {Icon && <Icon className={cn('size-4 shrink-0', TONE_TEXT[tone])} />}
      <div className="min-w-0 flex-1">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </Surface>
  );
}

/** Centered guidance for a region with nothing in it. */
export function EmptyState({
  icon,
  title,
  children,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-10 text-center',
        className,
      )}
    >
      {icon && <div className="text-cladd-fg-softer [&_svg]:size-6">{icon}</div>}
      <p className="text-cladd-sm font-semibold">{title}</p>
      {children && (
        <div className="max-w-sm text-cladd-xs leading-relaxed text-cladd-fg-soft">{children}</div>
      )}
      {actions && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function StatusDot({
  tone,
  pulse,
  className,
}: {
  tone: 'live' | 'warn' | 'ok' | 'cue' | 'idle' | 'danger' | 'accent';
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        tone === 'live' && 'bg-live',
        tone === 'warn' && 'bg-warn',
        tone === 'ok' && 'bg-ok',
        tone === 'cue' && 'bg-cue',
        tone === 'danger' && 'bg-danger',
        tone === 'accent' && 'bg-accent',
        tone === 'idle' && 'bg-cladd-fg-softer',
        pulse && 'animate-tally',
        className,
      )}
    />
  );
}
