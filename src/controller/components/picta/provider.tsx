import { useLayoutEffect, type ReactNode } from 'react';
import { CladdProvider, type ComponentDefaults } from '@cladd-ui/react';

/**
 * Picta's defaults for Cladd, set once so no component instance has to
 * repeat them.
 *
 *   - `md` (28px) is the control size. Compact row actions step down to `sm`
 *     explicitly; the few operator-critical targets step up to `lg`/`xl`.
 *   - Controls are squared like desktop software (`rounded: false`), not pills.
 *   - Focus rings sit flush against the control so neighbours do not overlap.
 *   - Select drops Cladd's 0-9 quick-pick hints, which would sit next to the
 *     number-key Screen switching, and opens as a well-aligned popover.
 */
export const PICTA_DEFAULTS: ComponentDefaults = {
  Button: { size: 'md', tightFocusRing: true },
  Input: { size: 'md', tightFocusRing: true },
  Textarea: { size: 'md', tightFocusRing: true },
  SearchField: { size: 'md', rounded: false, tightFocusRing: true },
  NumberScrubber: { size: 'md' },
  Select: {
    size: 'md',
    surface: 'cut',
    keyboardHints: false,
    popoverPosition: 'bottom-start',
    popoverOffset: 4,
    popoverClassName: 'min-w-[max(10rem,anchor-size(width))]',
  },
  Segmented: { size: 'md', rounded: false },
  ToggleGroup: { size: 'md', rounded: false },
  TabsList: { size: 'md', rounded: false },
  Toolbar: { size: 'md', rounded: false, variant: 'solid', outline: false },
  ListButton: { size: 'md', rounded: false },
  Checkbox: { size: 'xs' },
  Switch: { size: 'sm' },
  Shortcut: { size: 'sm' },
  Chip: { size: 'xs' },
  Tooltip: {},
};

export type Theme = 'dark' | 'light';

/**
 * Cladd themes from a `dark`/`light` class on an ancestor; Picta's own
 * styles and the audience renderer key off `data-theme`. Both are kept in sync.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset['theme'] = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
}

/** Mounts Cladd at the application root and follows Picta's theme. */
export function PictaProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  useLayoutEffect(() => applyTheme(theme), [theme]);
  return (
    <CladdProvider theme={theme} accentColor="brand" overlaysRoot="#root" defaults={PICTA_DEFAULTS}>
      {children}
    </CladdProvider>
  );
}
