/**
 * The menu behind a document-like thing: the Show, a rotation, a team.
 *
 * All three read the same: a name (with a dot when it has unsaved changes and
 * a quiet line saying where it lives) that opens a menu of file actions,
 * grouped New/Open, then Save/Reveal, then anything specific to the resource.
 * Menus hold actions only: no explanations, no settings.
 */

import type { ReactNode } from 'react';
import { Button } from '@cladd-ui/react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusDot } from './feedback';
import { ActionMenu, ActionMenuContent, ActionMenuTrigger, MenuItem, MenuSeparator } from './menu';

export interface ResourceAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  keys?: string[];
  disabled?: boolean;
  destructive?: boolean;
  onSelect(): void;
}

/** The grouped actions of a resource menu, for use inside any menu. */
export function ResourceMenuItems({ groups }: { groups: ResourceAction[][] }) {
  const visible = groups.filter((group) => group.length > 0);
  return visible.map((group, index) => (
    <div key={index} role="group">
      {index > 0 && <MenuSeparator />}
      {group.map((action) => (
        <MenuItem
          key={action.id}
          icon={action.icon ? <action.icon /> : undefined}
          keys={action.keys}
          disabled={action.disabled}
          destructive={action.destructive}
          onClick={action.onSelect}
        >
          {action.label}
        </MenuItem>
      ))}
    </div>
  ));
}

export function ResourceMenu({
  icon: Icon,
  name,
  dirty,
  unsavedLabel = 'Unsaved changes',
  where,
  ariaLabel,
  groups,
  className,
}: {
  icon?: LucideIcon;
  name: ReactNode;
  dirty?: boolean;
  unsavedLabel?: string;
  /** Where the resource lives: a file name, or "stored in show". */
  where?: ReactNode;
  ariaLabel?: string;
  /** Actions in groups; groups are separated, empty groups are skipped. */
  groups: ResourceAction[][];
  className?: string;
}) {
  return (
    <ActionMenu>
      <ActionMenuTrigger
        render={
          <Button
            variant="transparent"
            outline={false}
            {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
            className={cn('max-w-72 text-cladd-sm', className)}
          />
        }
      >
        {Icon && <Icon className="text-cladd-fg-soft" />}
        <span className="truncate">{name}</span>
        {dirty && <StatusDot tone="warn" className="size-1.5" />}
        {dirty && <span className="sr-only">{unsavedLabel}</span>}
        {where && (
          <span className="truncate text-cladd-xs font-normal text-cladd-fg-soft">{where}</span>
        )}
        <ChevronDown className="text-cladd-fg-softer" />
      </ActionMenuTrigger>
      <ActionMenuContent align="start" className="min-w-56">
        <ResourceMenuItems groups={groups} />
      </ActionMenuContent>
    </ActionMenu>
  );
}
