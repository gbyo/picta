/**
 * Focus return for modals opened from menus.
 *
 * A dialog opened from a menu item cannot return focus to that item: the menu
 * is gone by the time the dialog closes. Keyboard operators expect to land
 * back on the menu's button, so it is remembered here. After mouse use the
 * focus is left alone, so a button the operator just clicked never keeps focus
 * and Space keeps advancing media.
 */

let menuTrigger: HTMLElement | null = null;
let keyboard = false;

if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (event) => {
      const trigger =
        event.target instanceof Element ? event.target.closest('[aria-haspopup="menu"]') : null;
      if (trigger instanceof HTMLElement) menuTrigger = trigger;
    },
    true,
  );
  document.addEventListener('keydown', () => (keyboard = true), true);
  document.addEventListener('pointerdown', () => (keyboard = false), true);
}

export function restoreMenuFocus(): void {
  setTimeout(() => {
    if (keyboard && menuTrigger?.isConnected && document.activeElement === document.body)
      menuTrigger.focus({ preventScroll: true });
  }, 0);
}

/** Return focus to `element` after an overlay closes, but only for keyboard users. */
export function restoreFocusIfKeyboard(element: HTMLElement | null): void {
  setTimeout(() => {
    if (keyboard && element?.isConnected && document.activeElement === document.body)
      element.focus({ preventScroll: true });
  }, 0);
}
