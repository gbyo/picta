import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A quiet section heading: small caps label, optional detail and trailing actions. */
export function SectionHeader({
  label,
  detail,
  actions,
  className,
}: {
  label: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex h-8 min-w-0 items-center gap-2', className)}>
      <h2 className="label-caps shrink-0">{label}</h2>
      {detail !== undefined && (
        <div className="min-w-0 truncate text-[11.5px] text-fg-muted">{detail}</div>
      )}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

/** Centered guidance for an empty region. */
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
      {icon && <div className="mb-1 text-fg-faint [&_svg]:size-7">{icon}</div>}
      <p className="text-[13px] font-medium text-fg">{title}</p>
      {children && (
        <div className="max-w-sm text-[12px] leading-relaxed text-fg-muted">{children}</div>
      )}
      {actions && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{actions}</div>
      )}
    </div>
  );
}
