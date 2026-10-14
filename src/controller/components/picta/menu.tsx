/**
 * Action menus.
 *
 * Cladd has no menu primitive: it composes Popover + List, which is a fine
 * visual but has no roles, roving focus or typeahead. Picta's menus (Show,
 * Rotation, Team, the overflow menus, context menus) are exactly where those
 * matter, so the behaviour stays on Base UI's Menu and everything the operator
 * can see (surface, rows, separators, shortcuts, selected state) is drawn here
 * from Cladd tokens and components so a menu looks like any other Cladd popover.
 *
 * Feature code only ever imports from this file for menus.
 */

import type { ComponentProps, ReactNode } from 'react';
import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { Button, ListTitle, Surface, useTheme } from '@cladd-ui/react';
import { Check, ChevronRight, Ellipsis } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Keys } from './hint';

export const ActionMenu = MenuPrimitive.Root;
export const ActionMenuTrigger = MenuPrimitive.Trigger;
export const MenuSub = MenuPrimitive.SubmenuRoot;
export const MenuRadioGroup = MenuPrimitive.RadioGroup;

const ROW =
  'relative flex h-cladd-md w-full min-w-0 cursor-default items-center gap-2 rounded-cladd-md px-2 text-cladd-xs font-semibold outline-none select-none data-highlighted:bg-cladd-surface-hover data-popup-open:bg-cladd-surface-hover data-disabled:pointer-events-none data-disabled:opacity-40 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-cladd-fg-soft';

/** The popup surface: Cladd's popover recipe, theme-aware like Popover itself. */
function MenuSurface({ className, ...props }: ComponentProps<typeof Surface>) {
  const theme = useTheme();
  return (
    <Surface
      {...(theme === 'light' ? { level: 1 } : {})}
      variant={theme === 'light' ? 'solid' : 'gradient'}
      outline={theme === 'dark'}
      className={cn('z-50 w-fit min-w-44 rounded-cladd-popover shadow-cladd-popover', className)}
      contentClassName="max-h-(--available-height) overflow-y-auto p-1"
      {...props}
    />
  );
}

type PositionerProps = Pick<
  MenuPrimitive.Positioner.Props,
  'align' | 'alignOffset' | 'side' | 'sideOffset'
>;

export function ActionMenuContent({
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  className,
  children,
  ...props
}: MenuPrimitive.Popup.Props & PositionerProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          render={<MenuSurface {...(className ? { className: className as string } : {})} />}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export function MenuItem({
  icon,
  keys,
  destructive,
  className,
  children,
  ...props
}: MenuPrimitive.Item.Props & {
  icon?: ReactNode;
  /** Keyboard shortcut shown at the end of the row. */
  keys?: string[] | undefined;
  destructive?: boolean | undefined;
}) {
  return (
    <MenuPrimitive.Item
      className={cn(ROW, destructive && 'text-danger [&>svg]:text-danger', className)}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {keys && <Keys keys={keys} className="ml-2" />}
    </MenuPrimitive.Item>
  );
}

export function MenuRadioItem({ className, children, ...props }: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem className={cn(ROW, className)} {...props}>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <MenuPrimitive.RadioItemIndicator render={<span className="flex" />}>
        <Check className="text-cladd-primary" />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

export function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-cladd-outline', className)}
      {...props}
    />
  );
}

/** A group heading. Menus hold actions; this is the only text they carry. */
export function MenuTitle({ children }: { children: ReactNode }) {
  return (
    <ListTitle role="presentation" className="px-2 pt-2 pb-1">
      {children}
    </ListTitle>
  );
}

export function MenuSubTrigger({
  icon,
  className,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & { icon?: ReactNode }) {
  return (
    <MenuPrimitive.SubmenuTrigger className={cn(ROW, className)} {...props}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronRight className="text-cladd-fg-softer" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

export function MenuSubContent(props: ComponentProps<typeof ActionMenuContent>) {
  return (
    <ActionMenuContent side="right" align="start" alignOffset={-5} sideOffset={2} {...props} />
  );
}

/**
 * The standard "more" button: a quiet icon button that opens an action menu.
 * Workspace headers use it for everything that is not the primary action.
 */
export function OverflowMenu({
  label = 'More',
  align = 'end',
  children,
}: {
  label?: string;
  align?: 'start' | 'end';
  children: ReactNode;
}) {
  return (
    <ActionMenu>
      <ActionMenuTrigger
        render={
          <Button square variant="transparent" outline={false} aria-label={label}>
            <Ellipsis />
          </Button>
        }
      />
      <ActionMenuContent align={align}>{children}</ActionMenuContent>
    </ActionMenu>
  );
}

/* Context menus share the same rows. ---------------------------------------- */

export const ContextActions = ContextMenuPrimitive.Root;
export const ContextActionsTrigger = ContextMenuPrimitive.Trigger;

export function ContextActionsContent({
  className,
  children,
  ...props
}: ContextMenuPrimitive.Popup.Props) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align="start"
        alignOffset={4}
        side="right"
        sideOffset={0}
      >
        <ContextMenuPrimitive.Popup
          render={<MenuSurface {...(className ? { className: className as string } : {})} />}
          {...props}
        >
          {children}
        </ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}
