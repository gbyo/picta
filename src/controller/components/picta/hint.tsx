import type { ReactElement, ReactNode } from 'react';
import { Shortcut, Tooltip } from '@cladd-ui/react';

/** Picta writes shortcuts as symbols; Cladd's Shortcut speaks key names. */
const KEY_NAMES: Record<string, string> = {
  '⌘': 'cmd',
  Ctrl: 'ctrl',
  '⇧': 'shift',
  '⌥': 'alt',
  '→': 'right',
  '←': 'left',
  '↑': 'up',
  '↓': 'down',
  Esc: 'esc',
  Space: 'space',
  Enter: 'enter',
};

/** Keyboard keys for a shortcut, e.g. ['⌘', 'K']. */
export function Keys({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <Shortcut as="span" {...(className ? { className } : {})}>
      {keys.map((key) => KEY_NAMES[key] ?? key)}
    </Shortcut>
  );
}

/**
 * A tooltip that can show a keyboard shortcut. The trigger is passed as
 * `children`; it must accept a ref (Cladd controls do). A disabled control
 * receives no pointer events, so wrap it in a span when its tooltip matters.
 */
export function Hint({
  label,
  keys,
  side = 'top',
  children,
}: {
  label: ReactNode;
  keys?: string[];
  side?: 'top' | 'bottom';
  children: ReactElement;
}) {
  return (
    <Tooltip
      position={side}
      tooltip={
        <span className="flex items-center gap-2">
          <span>{label}</span>
          {keys && keys.length > 0 && <Keys keys={keys} />}
        </span>
      }
    >
      {children}
    </Tooltip>
  );
}
