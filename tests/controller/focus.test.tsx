// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/react';
import '../../src/controller/lib/focus.js';

afterEach(() => {
  document.body.innerHTML = '';
});

function trigger(kind: 'menu' | 'listbox' | 'dialog'): HTMLButtonElement {
  const button = document.createElement('button');
  button.setAttribute('aria-haspopup', kind);
  document.body.append(button);
  return button;
}

describe('overlay buttons and focus', () => {
  it('lets go of a menu, select or popover button focused by the mouse', () => {
    for (const kind of ['menu', 'listbox', 'dialog'] as const) {
      const button = trigger(kind);
      fireEvent.pointerDown(button);
      button.focus();
      expect(button).not.toHaveFocus();
    }
  });

  it('keeps focus on them for keyboard users', () => {
    const button = trigger('menu');
    fireEvent.keyDown(document.body, { key: 'Tab' });
    button.focus();
    expect(button).toHaveFocus();
  });

  it('lets go of a checkbox flipped with the mouse, but not with the keyboard', () => {
    const box = document.createElement('input');
    box.type = 'checkbox';
    document.body.append(box);
    fireEvent.pointerDown(box);
    box.focus();
    fireEvent.change(box);
    expect(box).not.toHaveFocus();
    fireEvent.keyDown(document.body, { key: ' ' });
    box.focus();
    fireEvent.change(box);
    expect(box).toHaveFocus();
  });

  it('leaves a submenu trigger alone: an open menu owns keyboard focus', () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const sub = document.createElement('div');
    sub.setAttribute('aria-haspopup', 'menu');
    sub.tabIndex = -1;
    menu.append(sub);
    document.body.append(menu);
    fireEvent.pointerDown(sub);
    sub.focus();
    expect(sub).toHaveFocus();
  });

  it('does not touch ordinary buttons', () => {
    const button = document.createElement('button');
    document.body.append(button);
    fireEvent.pointerDown(button);
    button.focus();
    expect(button).toHaveFocus();
  });
});
