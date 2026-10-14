/**
 * Workspace grammar.
 *
 * Every workspace reads the same way, so an operator never has to relearn
 * where things are:
 *
 *   WorkspaceHeader    identity (title + quiet metadata)  ·  primary action  ·  overflow
 *   WorkspaceToolbar   optional strip: tabs, filters, view options
 *   WorkspaceBody      the working area, with an Inspector on the right
 *
 * Surfaces follow Cladd's depth model: the working canvas is the application
 * background, and header, toolbar, rail and inspector are level-1 panels
 * sitting on it. Controls inside a panel are one level higher automatically.
 */

import type { ComponentProps, ReactNode } from 'react';
import { SectionTitle, Surface } from '@cladd-ui/react';
import { cn } from '@/lib/utils';

/**
 * A flat region of application chrome: a Surface whose content wrapper is the
 * flex container, so children lay out normally and paint above the surface.
 * Size and borders go on `className`; spacing and alignment on `contentClassName`.
 */
export function Panel({
  className,
  contentClassName,
  row,
  ...props
}: ComponentProps<typeof Surface> & { row?: boolean }) {
  return (
    <Surface
      className={cn('flex min-h-0', className)}
      contentClassName={cn(
        'flex min-h-0 min-w-0 flex-1',
        row ? 'flex-row items-center' : 'flex-col',
        contentClassName,
      )}
      {...props}
    />
  );
}

/** A scrolling region that fills the remaining space. */
export function Scroll({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)}
      {...props}
    />
  );
}

/** A workspace is also a container, so its parts can respond to its own width. */
export function Workspace({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('@container/ws flex h-full min-h-0 min-w-0 flex-col bg-cladd-bg', className)}
      {...props}
    />
  );
}

export function WorkspaceHeader({
  title,
  meta,
  actions,
  menu,
  className,
}: {
  /** The workspace's subject: a name, a resource menu or an inline-editable title. */
  title: ReactNode;
  /** Quiet facts about the subject. Truncates before anything else. */
  meta?: ReactNode;
  /** The primary action(s). Keep it to one or two. */
  actions?: ReactNode;
  /** An OverflowMenu (or similar) for everything else. */
  menu?: ReactNode;
  className?: string;
}) {
  return (
    <Panel
      as="header"
      row
      className={cn('h-cladd-xl shrink-0 border-b', className)}
      contentClassName="gap-3 px-3"
    >
      <div className="flex min-w-0 shrink-0 items-center text-cladd-sm font-semibold">{title}</div>
      <div className="min-w-0 flex-1 truncate text-cladd-xs text-cladd-fg-soft">{meta}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      {menu}
    </Panel>
  );
}

/** A secondary strip under the header: tabs, filters, view options. */
export function WorkspaceToolbar({ className, ...props }: ComponentProps<typeof Panel>) {
  return (
    <Panel
      row
      className={cn('min-h-cladd-xl shrink-0 border-b', className)}
      contentClassName="flex-wrap gap-x-3 gap-y-1 px-3 py-1"
      {...props}
    />
  );
}

/** The working area. Inspectors stack below it when the workspace is narrow. */
export function WorkspaceBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 @max-[560px]/ws:flex-col @max-[560px]/ws:overflow-y-auto',
        className,
      )}
      {...props}
    />
  );
}

/** The part of the body that is not the inspector. */
export function WorkspaceMain({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col @max-[560px]/ws:min-h-96 @max-[560px]/ws:flex-none',
        className,
      )}
      {...props}
    />
  );
}

/* Inspector ------------------------------------------------------------------ */

/**
 * The right-hand property surface. A selected object reads as: identity
 * (InspectorHeader), then named sections of PropertyRows, then contextual
 * actions, with anything destructive in its own section at the end.
 */
export function Inspector({
  label,
  side = 'right',
  className,
  children,
}: {
  label: string;
  side?: 'left' | 'right';
  className?: string;
  children: ReactNode;
}) {
  return (
    <Panel
      as="aside"
      aria-label={label}
      className={cn(
        'w-72 shrink-0 @max-[860px]/ws:w-64 @max-[700px]/ws:w-56 @max-[560px]/ws:h-auto @max-[560px]/ws:w-full',
        side === 'right'
          ? 'border-l @max-[560px]/ws:border-t @max-[560px]/ws:border-l-0'
          : 'border-r @max-[560px]/ws:border-b @max-[560px]/ws:border-r-0',
        className,
      )}
    >
      <Scroll className="flex flex-col gap-4 overflow-x-hidden p-3 @max-[560px]/ws:flex-none @max-[560px]/ws:overflow-visible">
        {children}
      </Scroll>
    </Panel>
  );
}

/** Who or what is selected: a picture or glyph, a name and a line of detail. */
export function InspectorHeader({
  media,
  title,
  subtitle,
  className,
}: {
  media?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      {media}
      <div className="min-w-0">
        <div className="truncate text-cladd-sm font-semibold">{title}</div>
        {subtitle && <div className="truncate text-cladd-xs text-cladd-fg-soft">{subtitle}</div>}
      </div>
    </div>
  );
}

/**
 * A section heading: Cladd's SectionTitle with an optional quiet detail
 * (sentence case) and trailing actions. Used in the rail, inspectors and decks.
 */
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
    <SectionTitle className={cn('h-cladd-sm items-center gap-2', className)}>
      <span className="shrink-0">{label}</span>
      {detail !== undefined && (
        <span className="min-w-0 flex-1 truncate font-normal tracking-normal text-cladd-fg-softer normal-case">
          {detail}
        </span>
      )}
      {actions && (
        <span className="ml-auto flex shrink-0 items-center gap-1 tracking-normal normal-case">
          {actions}
        </span>
      )}
    </SectionTitle>
  );
}

export function InspectorSection({
  title,
  detail,
  actions,
  className,
  children,
}: {
  title: ReactNode;
  detail?: ReactNode;
  /** Quiet inline actions for the whole section, e.g. "Use default". */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <SectionHeader
        label={title}
        {...(detail !== undefined ? { detail } : {})}
        {...(actions ? { actions } : {})}
      />
      {children}
    </section>
  );
}

/**
 * One property: a label and its control on a single 28px line. `stacked`
 * puts the control under the label for wide controls such as a segmented
 * control with three options.
 */
export function PropertyRow({
  label,
  htmlFor,
  stacked,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  stacked?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        stacked
          ? 'flex flex-col gap-1'
          : 'grid min-h-cladd-md grid-cols-[minmax(4.5rem,6.5rem)_minmax(0,1fr)] items-center gap-2',
        className,
      )}
    >
      <label htmlFor={htmlFor} className="truncate text-cladd-xs text-cladd-fg-soft">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** Read-only value in a property row. */
export function PropertyValue({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('min-w-0 truncate tabular', className)} {...props} />;
}

/**
 * A row in a list of selectable things (roster, Screens). Selection is
 * always the same: a brand-tinted raised row with an outline, exactly what
 * Cladd's selected ListButton looks like with Picta's selection colour.
 */
export function SelectableRow({
  selected,
  className,
  contentClassName,
  ...props
}: ComponentProps<typeof Surface> & { selected?: boolean }) {
  return (
    <Surface
      variant={selected ? 'gradient' : 'transparent'}
      color={selected ? 'brand' : ''}
      outline={Boolean(selected)}
      hoverable
      overlayPosition="below"
      className={cn('rounded-cladd-md', className)}
      {...(contentClassName ? { contentClassName } : {})}
      {...props}
    />
  );
}
