/**
 * Focus return for modals opened from menus.
 *
 * A dialog opened from a menu item cannot return focus to that item: the menu
 * is gone by the time the dialog closes. Keyboard operators expect to land
 * back on the menu's button, so it is remembered here. After mouse use focus
 * is never left on a button that opens an overlay, so a button the operator
 * just clicked never keeps focus and Space keeps advancing media.
 */

let menuTrigger: HTMLElement | null = null;
let keyboard = false;

if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (event) => {
      const trigger =
        event.target instanceof Element ? event.target.closest('[aria-haspopup]') : null;
      if (!(trigger instanceof HTMLElement)) return;
      if (trigger.getAttribute('aria-haspopup') === 'menu') menuTrigger = trigger;
      // A menu, select or popover button that gets focus because of the mouse
      // (including focus handed back when its overlay closes) must not keep it:
      // Space would reopen the overlay instead of advancing the media.
      if (!keyboard) trigger.blur();
    },
    true,
  );
  // Same for a checkbox or switch flipped with the mouse. Clicking its label
  // focuses the hidden input without a click event on the input itself, so this
  // listens for the change instead.
  document.addEventListener(
    'change',
    (event) => {
      const input = event.target;
      if (
        !keyboard &&
        input instanceof HTMLInputElement &&
        (input.type === 'checkbox' || input.type === 'radio')
      )
        input.blur();
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
