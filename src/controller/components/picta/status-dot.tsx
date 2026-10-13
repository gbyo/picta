import { cn } from '@/lib/utils';

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
        tone === 'idle' && 'bg-fg-faint',
        pulse && 'animate-tally',
        className,
      )}
    />
  );
}
