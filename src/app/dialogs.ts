/**
 * Small native dialogs for the controller.
 *
 * `window.prompt` and `window.confirm` are not dependable in the WebViews Tauri
 * builds on: Windows shows them, but macOS WKWebView and WebKitGTK return null
 * and false when the host implements no script-dialog panel, so the control
 * silently does nothing.  Scenes already moved to `<dialog>` for that reason;
 * these are the same shape for the rest of the controller.
 */

export interface TextDialogElements {
  dialog: HTMLDialogElement;
  form: HTMLFormElement;
  kicker: HTMLElement;
  title: HTMLElement;
  label: HTMLElement;
  input: HTMLInputElement;
  error: HTMLElement;
  confirm: HTMLButtonElement;
}

export interface TextDialogRequest {
  /** The small line above the title that names what is being changed. */
  kicker: string;
  title: string;
  label: string;
  confirmLabel: string;
  initialValue?: string;
  maxLength?: number;
  /** Return an error message to keep the dialog open, or null to accept. */
  validate?(value: string): string | null;
}

/** Resolves to the trimmed value, or null when the operator cancels. */
export function askText(
  elements: TextDialogElements,
  request: TextDialogRequest,
): Promise<string | null> {
  elements.kicker.textContent = request.kicker;
  elements.title.textContent = request.title;
  elements.label.textContent = request.label;
  elements.confirm.textContent = request.confirmLabel;
  elements.input.value = request.initialValue ?? '';
  elements.input.maxLength = request.maxLength ?? 60;
  elements.error.hidden = true;
  elements.error.textContent = '';

  return new Promise((resolve) => {
    const onSubmit = (event: SubmitEvent): void => {
      if ((event.submitter as HTMLButtonElement | null)?.value !== 'confirm') return;
      const value = elements.input.value.trim();
      const error = value === '' ? `Enter a ${request.label.toLocaleLowerCase()}.` : null;
      const problem = error ?? request.validate?.(value) ?? null;
      if (!problem) return;
      event.preventDefault();
      elements.error.textContent = problem;
      elements.error.hidden = false;
      elements.input.focus();
    };
    const onClose = (): void => {
      elements.form.removeEventListener('submit', onSubmit);
      resolve(elements.dialog.returnValue === 'confirm' ? elements.input.value.trim() : null);
    };
    elements.form.addEventListener('submit', onSubmit);
    elements.dialog.addEventListener('close', onClose, { once: true });
    elements.dialog.returnValue = 'cancel';
    elements.dialog.showModal();
    elements.input.select();
  });
}

export interface ConfirmDialogElements {
  dialog: HTMLDialogElement;
  kicker: HTMLElement;
  title: HTMLElement;
  text: HTMLElement;
  confirm: HTMLButtonElement;
}

export interface ConfirmRequest {
  kicker: string;
  title: string;
  text: string;
  confirmLabel: string;
  /** Paints the confirming button as destructive. */
  destructive?: boolean;
}

export function askConfirm(
  elements: ConfirmDialogElements,
  request: ConfirmRequest,
): Promise<boolean> {
  elements.kicker.textContent = request.kicker;
  elements.title.textContent = request.title;
  elements.text.textContent = request.text;
  elements.confirm.textContent = request.confirmLabel;
  elements.confirm.classList.toggle('stop-button', request.destructive === true);
  elements.confirm.classList.toggle('primary-button', request.destructive !== true);
  elements.dialog.returnValue = 'cancel';
  elements.dialog.showModal();
  return new Promise((resolve) =>
    elements.dialog.addEventListener(
      'close',
      () => resolve(elements.dialog.returnValue === 'confirm'),
      { once: true },
    ),
  );
}

export interface StatDialogElements {
  dialog: HTMLDialogElement;
  form: HTMLFormElement;
  label: HTMLInputElement;
  id: HTMLInputElement;
  shortLabel: HTMLInputElement;
  error: HTMLElement;
}

export interface CustomStat {
  id: string;
  label: string;
  shortLabel: string;
}

/** A statistic id is a lowercase token so it stays stable inside saved files. */
export function statIdFromLabel(label: string): string {
  return label
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function shortLabelFromLabel(label: string): string {
  return label.trim().slice(0, 4).toLocaleUpperCase();
}

/**
 * One dialog for the whole statistic rather than three chained prompts, so
 * backing out of the last field no longer discards the first two.
 */
export function askCustomStat(
  elements: StatDialogElements,
  isTaken: (id: string) => boolean,
): Promise<CustomStat | null> {
  elements.label.value = '';
  elements.id.value = '';
  elements.shortLabel.value = '';
  elements.error.hidden = true;
  elements.error.textContent = '';

  // The id and short label follow the label until the operator types their own.
  const syncFromLabel = (): void => {
    if (elements.id.dataset['touched'] !== 'true')
      elements.id.value = statIdFromLabel(elements.label.value);
    if (elements.shortLabel.dataset['touched'] !== 'true')
      elements.shortLabel.value = shortLabelFromLabel(elements.label.value);
  };
  const markTouched = (input: HTMLInputElement) => (): void => {
    input.dataset['touched'] = 'true';
  };
  const onIdInput = markTouched(elements.id);
  const onShortInput = markTouched(elements.shortLabel);
  delete elements.id.dataset['touched'];
  delete elements.shortLabel.dataset['touched'];

  return new Promise((resolve) => {
    let result: CustomStat | null = null;
    const fail = (message: string, focus: HTMLInputElement): void => {
      elements.error.textContent = message;
      elements.error.hidden = false;
      focus.focus();
    };
    const onSubmit = (event: SubmitEvent): void => {
      if ((event.submitter as HTMLButtonElement | null)?.value !== 'confirm') return;
      event.preventDefault();
      const label = elements.label.value.trim();
      const id = statIdFromLabel(elements.id.value || label);
      const shortLabel = elements.shortLabel.value.trim();
      if (!label) return fail('Enter a name for the statistic.', elements.label);
      if (!id) return fail('The id needs at least one letter or number.', elements.id);
      if (isTaken(id))
        return fail('This team already tracks a statistic with that id.', elements.id);
      if (!shortLabel)
        return fail('Enter a short label for the board column.', elements.shortLabel);
      result = { id, label, shortLabel };
      elements.dialog.close('confirm');
    };
    const onClose = (): void => {
      elements.form.removeEventListener('submit', onSubmit);
      elements.label.removeEventListener('input', syncFromLabel);
      elements.id.removeEventListener('input', onIdInput);
      elements.shortLabel.removeEventListener('input', onShortInput);
      resolve(elements.dialog.returnValue === 'confirm' ? result : null);
    };
    elements.form.addEventListener('submit', onSubmit);
    elements.label.addEventListener('input', syncFromLabel);
    elements.id.addEventListener('input', onIdInput);
    elements.shortLabel.addEventListener('input', onShortInput);
    elements.dialog.addEventListener('close', onClose, { once: true });
    elements.dialog.returnValue = 'cancel';
    elements.dialog.showModal();
    elements.label.focus();
  });
}
