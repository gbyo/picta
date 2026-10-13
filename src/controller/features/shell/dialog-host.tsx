import { useEffect, useRef, useState, type FormEvent } from 'react';
import { History, TriangleAlert } from 'lucide-react';
import { allBuiltInSports } from '@core/sports.js';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

function ConfirmBody({ request }: { request: ConfirmRequest }) {
  return (
    <>
      <AlertDialogTitle className="flex items-center gap-2 text-[14px] font-semibold">
        {request.tone === 'danger' && <TriangleAlert className="size-4 text-danger" />}
        {request.title}
      </AlertDialogTitle>
      <AlertDialogDescription className="text-[12.5px] leading-relaxed text-fg-muted">
        {request.body}
      </AlertDialogDescription>
      <div className="mt-2 flex justify-end gap-2">
        <Button onClick={() => resolveCurrent(false)} autoFocus>
          {request.cancelLabel ?? 'Cancel'}
        </Button>
        <Button
          variant={
            request.tone === 'danger' ? 'danger' : request.tone === 'live' ? 'live' : 'primary'
          }
          onClick={() => resolveCurrent(true)}
        >
          {request.confirmLabel}
        </Button>
      </div>
    </>
  );
}

function SaveChangesBody({ request }: { request: SaveChangesRequest }) {
  return (
    <>
      <AlertDialogTitle className="text-[14px] font-semibold">
        Save changes before {request.reason}?
      </AlertDialogTitle>
      <AlertDialogDescription className="text-[12.5px] leading-relaxed text-fg-muted">
        These have unsaved changes:
      </AlertDialogDescription>
      <ul className="rounded-md bg-sunken px-3 py-2 text-[12.5px] text-fg">
        {request.names.map((name) => (
          <li key={name} className="truncate">
            {name}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <Button variant="ghost" className="text-danger" onClick={() => resolveCurrent('discard')}>
          Don't Save
        </Button>
        <Button className="ml-auto" onClick={() => resolveCurrent('cancel')}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => resolveCurrent('save')} autoFocus>
          Save
        </Button>
      </div>
    </>
  );
}

function RecoveryBody({ request }: { request: RecoveryRequest }) {
  const when = new Date(request.savedAt).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <>
      <AlertDialogTitle className="flex items-center gap-2 text-[14px] font-semibold">
        <History className="size-4 text-accent" />
        Recover unsaved work?
      </AlertDialogTitle>
      <AlertDialogDescription className="text-[12.5px] leading-relaxed text-fg-muted">
        Picta did not close cleanly last time ({when}). It kept a copy of what was unsaved:
      </AlertDialogDescription>
      <ul className="rounded-md bg-sunken px-3 py-2 text-[12.5px] text-fg">
        {request.names.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <div className="mt-2 flex justify-end gap-2">
        <Button onClick={() => resolveCurrent('discard')}>Discard</Button>
        <Button variant="primary" onClick={() => resolveCurrent('recover')} autoFocus>
          Recover
        </Button>
      </div>
    </>
  );
}

function TextBody({ request }: { request: TextRequest }) {
  const [value, setValue] = useState(request.initialValue ?? '');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => input.current?.select());
  }, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
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
  };
  return (
    <form onSubmit={submit} className="grid gap-3">
      <DialogTitle className="text-[14px] font-semibold">{request.title}</DialogTitle>
      <div className="grid gap-1.5">
        <Label htmlFor="text-request">{request.label}</Label>
        <Input
          id="text-request"
          ref={input}
          value={value}
          maxLength={request.maxLength ?? 60}
          placeholder={request.placeholder}
          aria-invalid={error !== null}
          onChange={(event) => {
            setValue(event.currentTarget.value);
            setError(null);
          }}
        />
        {error && <p className="text-[11.5px] text-danger">{error}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={() => cancelCurrent()}>Cancel</Button>
        <Button variant="primary" type="submit">
          {request.confirmLabel}
        </Button>
      </div>
    </form>
  );
}

const SPORTS = allBuiltInSports();

function NewTeamBody() {
  const [details, setDetails] = useState<NewTeamDetails>({
    name: '',
    sport: 'volleyball',
    primary: '#1b4b36',
    secondary: '#ffffff',
    customName: '',
  });
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!details.name.trim()) {
      setError('Enter a team name.');
      return;
    }
    resolveCurrent({ ...details, name: details.name.trim() });
  };
  const preset = SPORTS.find((sport) => sport.id === details.sport);
  return (
    <form onSubmit={submit} className="grid gap-4">
      <div>
        <DialogTitle className="text-[14px] font-semibold">New team</DialogTitle>
        <DialogDescription className="mt-1 text-[12px] text-fg-muted">
          A reusable team: roster, photos, intro videos and groups. Save it as a .pictateam to use
          it at every event.
        </DialogDescription>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="team-name">Team name</Label>
        <Input
          id="team-name"
          autoFocus
          value={details.name}
          placeholder="e.g. Ninety Six Wildcats"
          onChange={(event) => {
            setDetails({ ...details, name: event.currentTarget.value });
            setError(null);
          }}
        />
        {error && <p className="text-[11.5px] text-danger">{error}</p>}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="grid gap-1.5">
          <Label>Sport</Label>
          <Select
            value={details.sport}
            onValueChange={(value) => setDetails({ ...details, sport: String(value) })}
          >
            <SelectTrigger className="w-full" aria-label="Sport">
              <SelectValue>
                {(value: string) =>
                  value === 'custom'
                    ? 'Custom sport'
                    : (SPORTS.find((sport) => sport.id === value)?.name ?? value)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SPORTS.map((sport) => (
                <SelectItem key={sport.id} value={sport.id}>
                  {sport.name}
                </SelectItem>
              ))}
              <SelectItem value="custom">Custom sport</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Colours</Label>
          <div className="flex h-7 items-center gap-1.5">
            {(['primary', 'secondary'] as const).map((which) => (
              <input
                key={which}
                type="color"
                aria-label={which === 'primary' ? 'Primary colour' : 'Secondary colour'}
                value={details[which]}
                onChange={(event) => setDetails({ ...details, [which]: event.currentTarget.value })}
                className="h-7 w-9 cursor-pointer rounded-[4px] border border-line-strong bg-transparent p-0.5"
              />
            ))}
          </div>
        </div>
      </div>
      {details.sport === 'custom' ? (
        <div className="grid gap-1.5">
          <Label htmlFor="custom-name">Sport name</Label>
          <Input
            id="custom-name"
            value={details.customName ?? ''}
            placeholder="e.g. Ultimate"
            onChange={(event) => setDetails({ ...details, customName: event.currentTarget.value })}
          />
          <p className="text-[11.5px] text-fg-faint">
            You add the statistics you want to count in Roster.
          </p>
        </div>
      ) : (
        preset && (
          <p className="text-[11.5px] text-fg-faint">
            Counts {preset.stats.map((stat) => stat.label.toLocaleLowerCase()).join(', ')}. Starts
            with {preset.defaultGroups.map((group) => group.name).join(' and ')} groups.
          </p>
        )
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={() => cancelCurrent()}>Cancel</Button>
        <Button variant="primary" type="submit">
          Create Team
        </Button>
      </div>
    </form>
  );
}

/** Renders whichever modal request is current. Escape and outside clicks cancel. */
export function DialogHost() {
  const current = useCurrentDialog();
  if (!current) return null;
  const { request } = current;
  const onOpenChange = (open: boolean) => {
    if (!open) cancelCurrent();
  };
  if (request.kind === 'text' || request.kind === 'new-team')
    return (
      <Dialog open onOpenChange={onOpenChange} key={current.id}>
        <DialogContent
          className="w-[min(420px,calc(100%-32px))] sm:max-w-none"
          showCloseButton={false}
        >
          {request.kind === 'text' ? <TextBody request={request} /> : <NewTeamBody />}
        </DialogContent>
      </Dialog>
    );
  return (
    <AlertDialog open onOpenChange={onOpenChange} key={current.id}>
      <AlertDialogContent className="w-[min(420px,calc(100%-32px))] sm:max-w-none data-[size=default]:max-w-none data-[size=default]:sm:max-w-none">
        {request.kind === 'confirm' && <ConfirmBody request={request} />}
        {request.kind === 'save-changes' && <SaveChangesBody request={request} />}
        {request.kind === 'recovery' && <RecoveryBody request={request} />}
      </AlertDialogContent>
    </AlertDialog>
  );
}
