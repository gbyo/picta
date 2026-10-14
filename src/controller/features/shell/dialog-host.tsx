import { useState } from 'react';
import { Button, Input, Select } from '@cladd-ui/react';
import { History, TriangleAlert } from 'lucide-react';
import { allBuiltInSports } from '@core/sports.js';
import {
  ActionButton,
  ColorField,
  explicitSubmit,
  Field,
  type Intent,
} from '@/components/picta/controls';
import { ModalDialog, useInitialFocus } from '@/components/picta/dialog';
import {
  cancelCurrent,
  resolveCurrent,
  useCurrentDialog,
  type ConfirmRequest,
  type NewTeamDetails,
  type RecoveryRequest,
  type SaveChangesRequest,
  type TextRequest,
} from '@/state/dialogs';

const dismiss = (open: boolean) => {
  if (!open) cancelCurrent();
};

const CONFIRM_INTENT: Record<NonNullable<ConfirmRequest['tone']> | 'default', Intent> = {
  default: 'primary',
  danger: 'danger-fill',
  live: 'live',
};

/** A question with a yes and a no. The safe answer (cancel) is focused. */
function ConfirmDialog({ request }: { request: ConfirmRequest }) {
  const cancel = useInitialFocus<HTMLButtonElement>();
  return (
    <ModalDialog
      onOpenChange={dismiss}
      title={
        <span className="flex items-center gap-2">
          {request.tone === 'danger' && <TriangleAlert className="size-4 text-danger" />}
          {request.title}
        </span>
      }
      text={request.body}
      actions={
        <>
          <Button ref={cancel} onClick={() => resolveCurrent(false)}>
            {request.cancelLabel ?? 'Cancel'}
          </Button>
          <ActionButton
            intent={CONFIRM_INTENT[request.tone ?? 'default']}
            onClick={() => resolveCurrent(true)}
          >
            {request.confirmLabel}
          </ActionButton>
        </>
      }
    />
  );
}

function NameList({ names }: { names: string[] }) {
  return (
    <ul className="rounded-cladd-md bg-cladd-surface-cut px-3 py-2 text-cladd-xs">
      {names.map((name) => (
        <li key={name} className="truncate">
          {name}
        </li>
      ))}
    </ul>
  );
}

function SaveChangesDialog({ request }: { request: SaveChangesRequest }) {
  const save = useInitialFocus<HTMLButtonElement>();
  return (
    <ModalDialog
      onOpenChange={dismiss}
      title={`Save changes before ${request.reason}?`}
      text="These have unsaved changes:"
      actions={
        <>
          <ActionButton
            intent="danger"
            className="mr-auto"
            onClick={() => resolveCurrent('discard')}
          >
            Don't Save
          </ActionButton>
          <Button onClick={() => resolveCurrent('cancel')}>Cancel</Button>
          <ActionButton ref={save} intent="primary" onClick={() => resolveCurrent('save')}>
            Save
          </ActionButton>
        </>
      }
    >
      <NameList names={request.names} />
    </ModalDialog>
  );
}

function RecoveryDialog({ request }: { request: RecoveryRequest }) {
  const recover = useInitialFocus<HTMLButtonElement>();
  const when = new Date(request.savedAt).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <ModalDialog
      onOpenChange={dismiss}
      title={
        <span className="flex items-center gap-2">
          <History className="size-4 text-cladd-primary" />
          Recover unsaved work?
        </span>
      }
      text={`Picta did not close cleanly last time (${when}). It kept a copy of what was unsaved:`}
      actions={
        <>
          <Button onClick={() => resolveCurrent('discard')}>Discard</Button>
          <ActionButton ref={recover} intent="primary" onClick={() => resolveCurrent('recover')}>
            Recover
          </ActionButton>
        </>
      }
    >
      <NameList names={request.names} />
    </ModalDialog>
  );
}

function TextDialog({ request }: { request: TextRequest }) {
  const field = useInitialFocus<HTMLInputElement>({ select: true });
  const [value, setValue] = useState(request.initialValue ?? '');
  const [error, setError] = useState<string | null>(null);
  const submit = explicitSubmit(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError(`Enter a ${request.label.toLocaleLowerCase()}.`);
      return;
    }
    const problem = request.validate?.(trimmed) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    resolveCurrent(trimmed);
  });
  return (
    <ModalDialog
      onOpenChange={dismiss}
      title={request.title}
      actions={
        <>
          <Button onClick={() => cancelCurrent()}>Cancel</Button>
          <ActionButton intent="primary" type="submit" form="text-request-form">
            {request.confirmLabel}
          </ActionButton>
        </>
      }
    >
      <form id="text-request-form" onSubmit={submit}>
        <Field label={request.label} htmlFor="text-request" error={error}>
          <Input
            inputId="text-request"
            value={value}
            maxLength={request.maxLength ?? 60}
            placeholder={request.placeholder ?? ''}
            valid={error === null}
            inputRef={field}
            onChange={(next) => {
              setValue(next);
              setError(null);
            }}
          />
        </Field>
      </form>
    </ModalDialog>
  );
}

const SPORTS = allBuiltInSports();
const SPORT_IDS = [...SPORTS.map((sport) => sport.id), 'custom'];

function sportName(id: string): string {
  return id === 'custom' ? 'Custom sport' : (SPORTS.find((sport) => sport.id === id)?.name ?? id);
}

function NewTeamDialog() {
  const name = useInitialFocus<HTMLInputElement>();
  const [details, setDetails] = useState<NewTeamDetails>({
    name: '',
    sport: 'volleyball',
    primary: '#1b4b36',
    secondary: '#ffffff',
    customName: '',
  });
  const [error, setError] = useState<string | null>(null);
  const submit = explicitSubmit(() => {
    if (!details.name.trim()) {
      setError('Enter a team name.');
      return;
    }
    resolveCurrent({ ...details, name: details.name.trim() });
  });
  const preset = SPORTS.find((sport) => sport.id === details.sport);
  return (
    <ModalDialog
      onOpenChange={dismiss}
      title="New team"
      text="A reusable team: roster, photos, intro videos and groups. Save it as a .pictateam to use it at every event."
      actions={
        <>
          <Button onClick={() => cancelCurrent()}>Cancel</Button>
          <ActionButton intent="primary" type="submit" form="new-team-form">
            Create Team
          </ActionButton>
        </>
      }
    >
      <form id="new-team-form" onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Team name" htmlFor="team-name" error={error}>
          <Input
            inputId="team-name"
            inputRef={name}
            value={details.name}
            placeholder="e.g. Ninety Six Wildcats"
            valid={error === null}
            onChange={(next) => {
              setDetails({ ...details, name: next });
              setError(null);
            }}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sport">
            <Select
              options={SPORT_IDS}
              value={details.sport}
              onChange={(value) => setDetails({ ...details, sport: value })}
              renderOption={({ value }) => sportName(value)}
              aria-label="Sport"
            >
              {sportName(details.sport)}
            </Select>
          </Field>
          <Field label="Colours">
            <div className="flex gap-2">
              {(['primary', 'secondary'] as const).map((which) => (
                <ColorField
                  key={which}
                  label={which === 'primary' ? 'Primary colour' : 'Secondary colour'}
                  value={details[which]}
                  onChange={(hex) => setDetails({ ...details, [which]: hex })}
                  className="w-auto min-w-0 flex-1"
                />
              ))}
            </div>
          </Field>
        </div>
        {details.sport === 'custom' ? (
          <Field
            label="Sport name"
            htmlFor="custom-name"
            hint="You add the statistics you want to count in Roster."
          >
            <Input
              inputId="custom-name"
              value={details.customName ?? ''}
              placeholder="e.g. Ultimate"
              onChange={(next) => setDetails({ ...details, customName: next })}
            />
          </Field>
        ) : (
          preset && (
            <p className="text-cladd-xs text-cladd-fg-softer">
              Counts {preset.stats.map((stat) => stat.label.toLocaleLowerCase()).join(', ')}. Starts
              with {preset.defaultGroups.map((group) => group.name).join(' and ')} groups.
            </p>
          )
        )}
      </form>
    </ModalDialog>
  );
}

/** Renders whichever modal request is current. Escape and outside clicks cancel. */
export function DialogHost() {
  const current = useCurrentDialog();
  if (!current) return null;
  const { request } = current;
  switch (request.kind) {
    case 'confirm':
      return <ConfirmDialog key={current.id} request={request} />;
    case 'save-changes':
      return <SaveChangesDialog key={current.id} request={request} />;
    case 'recovery':
      return <RecoveryDialog key={current.id} request={request} />;
    case 'text':
      return <TextDialog key={current.id} request={request} />;
    case 'new-team':
      return <NewTeamDialog key={current.id} />;
  }
}
