/**
 * The dialogs that replaced window.prompt, driven against the real markup in
 * index.html so a renamed field fails here rather than at a game.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  askConfirm,
  askCustomStat,
  askText,
  type ConfirmDialogElements,
  type StatDialogElements,
  type TextDialogElements,
} from '../src/app/dialogs.js';

const html = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8');

let document: Document;

function need<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing element: ${id}`);
  return element as unknown as T;
}

/** jsdom implements <dialog> state but not the modal top layer. */
function stubDialog(dialog: HTMLDialogElement): void {
  dialog.showModal = function showModal(): void {
    this.open = true;
  };
  dialog.close = function close(returnValue?: string): void {
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.open = false;
    this.dispatchEvent(new (document.defaultView as Window & typeof globalThis).Event('close'));
  };
}

function submit(form: HTMLFormElement, value: string): void {
  const submitter = form.querySelector<HTMLButtonElement>(`button[value="${value}"]`);
  if (!submitter) throw new Error(`missing submitter: ${value}`);
  // jsdom does not run implicit submission, so drive the event the dialogs read.
  const event = new (document.defaultView as Window & typeof globalThis).Event('submit', {
    bubbles: true,
    cancelable: true,
  }) as SubmitEvent;
  Object.defineProperty(event, 'submitter', { value: submitter });
  const prevented = !form.dispatchEvent(event);
  if (!prevented) {
    const dialog = form.closest('dialog') as HTMLDialogElement | null;
    dialog?.close(value);
  }
}

function textElements(): TextDialogElements {
  const elements = {
    dialog: need<HTMLDialogElement>('text-dialog'),
    form: need<HTMLFormElement>('text-dialog-form'),
    kicker: need<HTMLElement>('text-dialog-kicker'),
    title: need<HTMLElement>('text-dialog-title'),
    label: need<HTMLElement>('text-dialog-label'),
    input: need<HTMLInputElement>('text-dialog-input'),
    error: need<HTMLElement>('text-dialog-error'),
    confirm: need<HTMLButtonElement>('text-dialog-confirm'),
  };
  stubDialog(elements.dialog);
  return elements;
}

function confirmElements(): ConfirmDialogElements {
  const elements = {
    dialog: need<HTMLDialogElement>('action-dialog'),
    kicker: need<HTMLElement>('action-dialog-kicker'),
    title: need<HTMLElement>('action-dialog-title'),
    text: need<HTMLElement>('action-dialog-text'),
    confirm: need<HTMLButtonElement>('action-dialog-confirm'),
  };
  stubDialog(elements.dialog);
  return elements;
}

function statElements(): StatDialogElements {
  const elements = {
    dialog: need<HTMLDialogElement>('stat-dialog'),
    form: need<HTMLFormElement>('stat-dialog-form'),
    label: need<HTMLInputElement>('stat-dialog-label'),
    id: need<HTMLInputElement>('stat-dialog-id'),
    shortLabel: need<HTMLInputElement>('stat-dialog-short'),
    error: need<HTMLElement>('stat-dialog-error'),
  };
  stubDialog(elements.dialog);
  return elements;
}

function input(element: HTMLInputElement, value: string): void {
  element.value = value;
  element.dispatchEvent(
    new (document.defaultView as Window & typeof globalThis).Event('input', { bubbles: true }),
  );
}

beforeEach(() => {
  const dom = new JSDOM(html);
  document = dom.window.document;
});

describe('text dialog', () => {
  it('returns the trimmed value the operator confirmed', async () => {
    const elements = textElements();
    const pending = askText(elements, {
      kicker: 'Presentation',
      title: 'New group',
      label: 'Group name',
      confirmLabel: 'Create group',
    });
    input(elements.input, '  Starting Six  ');
    submit(elements.form, 'confirm');
    await expect(pending).resolves.toBe('Starting Six');
  });

  it('returns null when the operator cancels', async () => {
    const elements = textElements();
    const pending = askText(elements, {
      kicker: 'Presentation',
      title: 'New group',
      label: 'Group name',
      confirmLabel: 'Create group',
    });
    input(elements.input, 'Discarded');
    submit(elements.form, 'cancel');
    await expect(pending).resolves.toBeNull();
  });

  it('keeps the dialog open and explains a rejected name', async () => {
    const elements = textElements();
    const pending = askText(elements, {
      kicker: 'Presentation',
      title: 'New group',
      label: 'Group name',
      confirmLabel: 'Create group',
      validate: (value) => (value === 'Taken' ? 'That name is in use.' : null),
    });

    input(elements.input, 'Taken');
    submit(elements.form, 'confirm');
    expect(elements.dialog.open).toBe(true);
    expect(elements.error.hidden).toBe(false);
    expect(elements.error.textContent).toBe('That name is in use.');

    input(elements.input, 'Fresh');
    submit(elements.form, 'confirm');
    await expect(pending).resolves.toBe('Fresh');
  });

  it('refuses an empty name without asking the caller', async () => {
    const elements = textElements();
    const pending = askText(elements, {
      kicker: 'Presentation',
      title: 'New group',
      label: 'Group name',
      confirmLabel: 'Create group',
    });
    input(elements.input, '   ');
    submit(elements.form, 'confirm');
    expect(elements.dialog.open).toBe(true);
    expect(elements.error.hidden).toBe(false);

    input(elements.input, 'Libero');
    submit(elements.form, 'confirm');
    await expect(pending).resolves.toBe('Libero');
  });
});

describe('confirm dialog', () => {
  it('resolves true only when the destructive action is confirmed', async () => {
    const elements = confirmElements();
    const pending = askConfirm(elements, {
      kicker: 'Presentation',
      title: 'Remove group',
      text: 'Remove the group?',
      confirmLabel: 'Remove group',
      destructive: true,
    });
    expect(elements.confirm.classList.contains('stop-button')).toBe(true);
    elements.dialog.close('confirm');
    await expect(pending).resolves.toBe(true);
  });

  it('treats a dismissal as a no', async () => {
    const elements = confirmElements();
    const pending = askConfirm(elements, {
      kicker: 'Presentation',
      title: 'Remove group',
      text: 'Remove the group?',
      confirmLabel: 'Remove group',
    });
    elements.dialog.close('cancel');
    await expect(pending).resolves.toBe(false);
  });
});

describe('custom statistic dialog', () => {
  it('derives the id and short label from the name', async () => {
    const elements = statElements();
    const pending = askCustomStat(elements, () => false);
    input(elements.label, 'Blocked Shots');
    expect(elements.id.value).toBe('blocked-shots');
    expect(elements.shortLabel.value).toBe('BLOC');
    submit(elements.form, 'confirm');
    await expect(pending).resolves.toEqual({
      id: 'blocked-shots',
      label: 'Blocked Shots',
      shortLabel: 'BLOC',
    });
  });

  it('stops overwriting a field the operator typed into', async () => {
    const elements = statElements();
    const pending = askCustomStat(elements, () => false);
    input(elements.label, 'Points');
    input(elements.shortLabel, 'PTS');
    input(elements.label, 'Points Scored');
    expect(elements.shortLabel.value).toBe('PTS');
    expect(elements.id.value).toBe('points-scored');
    submit(elements.form, 'confirm');
    await expect(pending).resolves.toEqual({
      id: 'points-scored',
      label: 'Points Scored',
      shortLabel: 'PTS',
    });
  });

  it('rejects an id the team already tracks and keeps the entered values', async () => {
    const elements = statElements();
    const pending = askCustomStat(elements, (id) => id === 'aces');
    input(elements.label, 'Aces');
    submit(elements.form, 'confirm');

    expect(elements.dialog.open).toBe(true);
    expect(elements.error.hidden).toBe(false);
    expect(elements.label.value).toBe('Aces');

    input(elements.id, 'service-aces');
    submit(elements.form, 'confirm');
    await expect(pending).resolves.toEqual({
      id: 'service-aces',
      label: 'Aces',
      shortLabel: 'ACES',
    });
  });

  it('rejects a name that cannot produce an id', async () => {
    const elements = statElements();
    const pending = askCustomStat(elements, () => false);
    input(elements.label, '???');
    submit(elements.form, 'confirm');
    expect(elements.dialog.open).toBe(true);
    expect(elements.error.hidden).toBe(false);

    input(elements.label, 'Digs');
    submit(elements.form, 'confirm');
    await expect(pending).resolves.toEqual({ id: 'digs', label: 'Digs', shortLabel: 'DIGS' });
  });

  it('starts clean rather than remembering the last statistic', async () => {
    const first = statElements();
    const pending = askCustomStat(first, () => false);
    input(first.label, 'Points');
    input(first.shortLabel, 'PTS');
    submit(first.form, 'cancel');
    await expect(pending).resolves.toBeNull();

    const second = askCustomStat(statElements(), () => false);
    expect(first.label.value).toBe('');
    expect(first.shortLabel.value).toBe('');
    // The short label must follow the name again after a cancelled attempt.
    input(first.label, 'Digs');
    expect(first.shortLabel.value).toBe('DIGS');
    submit(first.form, 'confirm');
    await expect(second).resolves.toEqual({ id: 'digs', label: 'Digs', shortLabel: 'DIGS' });
  });
});
