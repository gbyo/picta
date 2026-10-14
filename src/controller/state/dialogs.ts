/**
 * Promise-based modal requests.
 *
 * Actions ask the operator a question with `await ask.confirm(...)`; the
 * DialogHost component renders whichever request is current. Requests queue,
 * so a save prompt raised while another dialog is open waits its turn rather
 * than replacing it.
 */

import { createStore, useStore } from 'zustand';

export type Tone = 'default' | 'danger' | 'live';

export interface ConfirmRequest {
  kind: 'confirm';
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: Tone;
}

export interface SaveChangesRequest {
  kind: 'save-changes';
  names: string[];
  /** What happens after saving, e.g. "opening another show". */
  reason: string;
}

export interface TextRequest {
  kind: 'text';
  title: string;
  label: string;
  confirmLabel: string;
  initialValue?: string;
  placeholder?: string;
  maxLength?: number;
  validate?(value: string): string | null;
}

export interface RecoveryRequest {
  kind: 'recovery';
  savedAt: number;
  names: string[];
}

export interface NewTeamDetails {
  name: string;
  sport: string;
  primary: string;
  secondary: string;
  customName?: string;
}

export interface NewTeamRequest {
  kind: 'new-team';
}

export type DialogRequest =
  ConfirmRequest | SaveChangesRequest | TextRequest | RecoveryRequest | NewTeamRequest;

type ResultFor<R extends DialogRequest> = R extends ConfirmRequest
  ? boolean
  : R extends SaveChangesRequest
    ? 'save' | 'discard' | 'cancel'
    : R extends TextRequest
      ? string | null
      : R extends RecoveryRequest
        ? 'recover' | 'discard'
        : R extends NewTeamRequest
          ? NewTeamDetails | null
          : never;

export interface Pending {
  id: number;
  request: DialogRequest;
  resolve(value: unknown): void;
  cancelValue: unknown;
}

interface DialogState {
  queue: Pending[];
}

export const dialogStore = createStore<DialogState>()(() => ({ queue: [] }));

let nextId = 0;

function cancelValueFor(request: DialogRequest): unknown {
  switch (request.kind) {
    case 'confirm':
      return false;
    case 'save-changes':
      return 'cancel';
    case 'text':
    case 'new-team':
      return null;
    case 'recovery':
      return 'discard';
  }
}

export function request<R extends DialogRequest>(req: R): Promise<ResultFor<R>> {
  return new Promise((resolve) => {
    nextId += 1;
    const pending: Pending = {
      id: nextId,
      request: req,
      resolve: resolve as (value: unknown) => void,
      cancelValue: cancelValueFor(req),
    };
    dialogStore.setState((state) => ({ queue: [...state.queue, pending] }));
  });
}

export function resolveCurrent(value: unknown): void {
  const current = dialogStore.getState().queue[0];
  if (!current) return;
  dialogStore.setState((state) => ({ queue: state.queue.slice(1) }));
  current.resolve(value);
}

/**
 * Cancel the current request. With an `id`, only if that request is still the
 * current one: a dialog that finishes closing late must not cancel the
 * request that replaced it.
 */
export function cancelCurrent(id?: number): void {
  const current = dialogStore.getState().queue[0];
  if (current && (id === undefined || current.id === id)) resolveCurrent(current.cancelValue);
}

export function useCurrentDialog(): Pending | null {
  return useStore(dialogStore, (state) => state.queue[0] ?? null);
}

export function anyDialogOpen(): boolean {
  return dialogStore.getState().queue.length > 0;
}

export const ask = {
  confirm: (options: Omit<ConfirmRequest, 'kind'>) => request({ kind: 'confirm', ...options }),
  saveChanges: (names: string[], reason: string) =>
    request({ kind: 'save-changes', names, reason }),
  text: (options: Omit<TextRequest, 'kind'>) => request({ kind: 'text', ...options }),
  recovery: (savedAt: number, names: string[]) => request({ kind: 'recovery', savedAt, names }),
  newTeam: () => request({ kind: 'new-team' }),
};
