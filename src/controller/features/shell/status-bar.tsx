import { CircleAlert, CircleCheck, Info, OctagonX, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Keys } from '@/components/picta/hint';
import { cn } from '@/lib/utils';
import { usePicta, type ActivityLevel } from '@/state/store';
import { dirtyNames } from '@/state/derive';
import { dismissUpdate } from '@/boot';
import { rt } from '@/runtime';
import { mod } from '@/shortcuts';

const LEVEL_ICON: Record<ActivityLevel, typeof Info> = {
  info: Info,
  success: CircleCheck,
  warning: CircleAlert,
  error: OctagonX,
};

const LEVEL_TONE: Record<ActivityLevel, string> = {
  info: 'text-fg-faint',
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
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex h-full min-w-0 items-center gap-1.5 rounded-[4px] px-1.5 text-left outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Activity log"
          />
        }
      >
        <Icon
          className={cn('size-3.5 shrink-0', last ? LEVEL_TONE[last.level] : 'text-fg-faint')}
        />
        <span className="truncate">{last ? last.text : 'Ready'}</span>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[420px] gap-0 p-0">
        <p className="label-caps border-b border-line px-3 py-2.5">Activity</p>
        <ScrollArea className="max-h-80">
          {activity.length === 0 ? (
            <p className="px-3 py-4 text-[12px] text-fg-faint">Nothing has happened yet.</p>
          ) : (
            <ol className="flex flex-col-reverse py-1">
              {activity.map((entry) => {
                const EntryIcon = LEVEL_ICON[entry.level];
                return (
                  <li key={entry.id} className="flex gap-2 px-3 py-1.5 text-[12px]">
                    <EntryIcon
                      className={cn('mt-0.5 size-3.5 shrink-0', LEVEL_TONE[entry.level])}
                    />
                    <span className="min-w-0 flex-1 text-fg">{entry.text}</span>
                    <span className="shrink-0 text-[11px] text-fg-faint tabular">
                      {time(entry.at)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function UpdateNotice() {
  const update = usePicta((state) => state.update);
  if (!update) return null;
  return (
    <span className="flex items-center gap-1 rounded-[4px] bg-accent-soft pl-2 text-accent">
      <Download className="size-3.5" />
      <button
        type="button"
        className="outline-none hover:underline"
        onClick={() =>
          void rt()
            .platform.updates.openReleases()
            .catch(() => undefined)
        }
      >
        Picta {update.latestVersion} is available
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss update notice"
        onClick={dismissUpdate}
      >
        <X />
      </Button>
    </span>
  );
}

export function StatusBar() {
  const joined = usePicta((state) => dirtyNames(state.doc, state.pathStyle).join(', '));
  const names = joined ? joined.split(', ') : [];
  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line bg-surface px-2 text-[11.5px] text-fg-muted">
      <div className="min-w-0 flex-1">
        <ActivityLog />
      </div>
      <UpdateNotice />
      <span
        className={cn(
          'flex shrink-0 items-center gap-1.5',
          names.length > 0 ? 'text-warn' : 'text-fg-faint',
        )}
        title={names.join(', ')}
      >
        <span className={cn('size-1.5 rounded-full', names.length > 0 ? 'bg-warn' : 'bg-ok')} />
        {names.length > 0 ? `Unsaved · ${names.join(', ')}` : 'All changes saved'}
      </span>
      <span className="hidden shrink-0 items-center gap-1.5 text-fg-faint lg:flex">
        <Keys keys={[mod.replace('+', ''), 'K']} /> commands
        <Keys keys={['?']} /> shortcuts
      </span>
    </footer>
  );
}
