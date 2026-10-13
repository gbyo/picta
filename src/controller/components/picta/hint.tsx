import type { ReactElement, ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Kbd, KbdGroup } from '@/components/ui/kbd';

/**
 * A tooltip that can show a keyboard shortcut. The trigger element is passed
 * as `children` and rendered as-is through Base UI's render prop.
 */
export function Hint({
  label,
  keys,
  side = 'top',
  children,
  ...forwarded
}: {
  label: ReactNode;
  keys?: string[];
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactElement;
} & Record<string, unknown>) {
  // Props from an outer trigger (a context menu, a popover) are forwarded so
  // Hint can sit inside another Base UI `render` prop without swallowing them.
  return (
    <Tooltip>
      <TooltipTrigger {...forwarded} render={children} />
      <TooltipContent side={side}>
        <span>{label}</span>
        {keys && keys.length > 0 && <Keys keys={keys} />}
      </TooltipContent>
    </Tooltip>
  );
}

export function Keys({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <KbdGroup {...(className ? { className } : {})}>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}
