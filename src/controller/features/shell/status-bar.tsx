import { Button, SectionTitle } from '@cladd-ui/react';
import { CircleAlert, CircleCheck, Download, Info, OctagonX, X } from 'lucide-react';
import { IconButton } from '@/components/picta/controls';
import { Keys } from '@/components/picta/hint';
import { PictaPopover } from '@/components/picta/popover';
import { Panel } from '@/components/picta/workspace';
import { StatusDot } from '@/components/picta/feedback';
import { cn } from '@/lib/utils';
import { usePicta, type ActivityLevel } from '@/state/store';
import { dirtyNames } from '@/state/derive';
import { dismissUpdate } from '@/boot';
import { rt } from '@/runtime';
import { modKey } from '@/shortcuts';

const LEVEL_ICON: Record<ActivityLevel, typeof Info> = {
  info: Info,
  success: CircleCheck,
  warning: CircleAlert,
  error: OctagonX,
};

const LEVEL_TONE: Record<ActivityLevel, string> = {
  info: 'text-cladd-fg-softer',
  success: 'text-ok',
  warning: 'text-warn',
  error: 'text-danger',
};

function time(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ActivityLog() {
  const activity = usePicta((state) => state.activity);
  const last = activity.at(-1);
  const Icon = last ? LEVEL_ICON[last.level] : Info;
  return (
    <PictaPopover
      label="Activity"
      position="top-start"
      width="lg"
      contentClassName="p-0"
      trigger={
        <Button
          size="sm"
          variant="transparent"
          outline={false}
          aria-label="Activity log"
          className="max-w-full"
        >
          <Icon className={last ? LEVEL_TONE[last.level] : 'text-cladd-fg-softer'} />
          <span className="truncate font-medium">{last ? last.text : 'Ready'}</span>
        </Button>
      }
    >
      <SectionTitle className="px-3 pt-3 pb-2">Activity</SectionTitle>
      {activity.length === 0 ? (
        <p className="px-3 pb-4 text-cladd-xs text-cladd-fg-soft">Nothing has happened yet.</p>
      ) : (
        <ol className="flex flex-col-reverse pb-2">
          {activity.map((entry) => {
            const EntryIcon = LEVEL_ICON[entry.level];
            return (
              <li key={entry.id} className="flex gap-2 px-3 py-1.5 text-cladd-xs">
                <EntryIcon className={cn('mt-0.5 size-4 shrink-0', LEVEL_TONE[entry.level])} />
                <span className="min-w-0 flex-1">{entry.text}</span>
                <span className="shrink-0 text-cladd-fg-softer tabular">{time(entry.at)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </PictaPopover>
  );
}

function UpdateNotice() {
  const update = usePicta((state) => state.update);
  if (!update) return null;
  return (
    <span className="flex items-center gap-1 text-cladd-primary">
      <Button
        size="sm"
        color="brand"
        variant="transparent"
        outline={false}
        onClick={() =>
          void rt()
            .platform.updates.openReleases()
            .catch(() => undefined)
        }
      >
        <Download />
        Picta {update.latestVersion} is available
      </Button>
      <IconButton label="Dismiss update notice" size="sm" onClick={dismissUpdate}>
        <X />
      </IconButton>
    </span>
  );
}

export function StatusBar() {
  const joined = usePicta((state) => dirtyNames(state.doc, state.pathStyle).join(', '));
  const names = joined ? joined.split(', ') : [];
  return (
    <Panel
      as="footer"
      row
      className="h-cladd-md shrink-0 border-t"
      contentClassName="gap-3 px-2 text-cladd-xs text-cladd-fg-soft"
    >
      <div className="min-w-0 flex-1">
        <ActivityLog />
      </div>
      <UpdateNotice />
      <span
        className={cn('flex shrink-0 items-center gap-1.5', names.length > 0 && 'text-warn')}
        title={names.join(', ')}
      >
        <StatusDot tone={names.length > 0 ? 'warn' : 'ok'} className="size-1.5" />
        {names.length > 0 ? `Unsaved · ${names.join(', ')}` : 'All changes saved'}
      </span>
      <span className="hidden shrink-0 items-center gap-1.5 text-cladd-fg-softer lg:flex">
        <Keys keys={[modKey, 'K']} /> commands
        <Keys keys={['?']} /> shortcuts
      </span>
    </Panel>
  );
}
