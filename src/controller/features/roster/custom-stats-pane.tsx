import { useState } from 'react';
import { Input, Surface } from '@cladd-ui/react';
import { Plus, Trash2 } from 'lucide-react';
import { shortLabelFromLabel, statIdFromLabel } from '@core/custom-stats.js';
import { ActionButton, explicitSubmit, Field, IconButton } from '@/components/picta/controls';
import { Scroll } from '@/components/picta/workspace';
import { useTeam } from '@/hooks';
import { setCustomStats } from '@/actions/team';

/** A custom sport counts whatever the operator defines here. */
export function CustomStatsPane() {
  const team = useTeam();
  const [label, setLabel] = useState('');
  const [short, setShort] = useState('');
  const [error, setError] = useState<string | null>(null);
  const custom = team?.customSport;
  if (!team || !custom) return null;
  const stats = custom.stats.map(({ id, label: name, shortLabel }) => ({
    id,
    label: name,
    shortLabel,
  }));

  const submit = explicitSubmit(() => {
    const id = statIdFromLabel(label);
    if (!id) {
      setError('Enter a statistic name with letters or numbers.');
      return;
    }
    if (stats.some((stat) => stat.id === id)) {
      setError('That statistic already exists.');
      return;
    }
    setCustomStats([
      ...stats,
      {
        id,
        label: label.trim(),
        shortLabel: (short.trim() || shortLabelFromLabel(label)).slice(0, 4),
      },
    ]);
    setLabel('');
    setShort('');
    setError(null);
  });

  return (
    <Scroll>
      <div className="flex max-w-2xl flex-col gap-3 p-4">
        <p className="text-cladd-xs text-cladd-fg-soft">
          {custom.name} counts these statistics. The first four appear on the stats board and player
          cards by default.
        </p>
        <Surface as="ol" className="rounded-cladd-lg" contentClassName="flex flex-col">
          {stats.length === 0 && (
            <li className="px-3 py-3 text-cladd-xs text-cladd-fg-softer">No statistics yet.</li>
          )}
          {stats.map((stat, index) => (
            <li
              key={stat.id}
              className="flex h-cladd-lg items-center gap-3 border-b px-3 last:border-b-0"
            >
              <span className="w-4 text-cladd-xs text-cladd-fg-softer tabular">{index + 1}</span>
              <span className="w-12 text-cladd-xs font-semibold">{stat.shortLabel}</span>
              <span className="min-w-0 flex-1 truncate text-cladd-xs">{stat.label}</span>
              <span className="text-cladd-xs text-cladd-fg-softer">{stat.id}</span>
              <IconButton
                label={`Remove ${stat.label}`}
                size="sm"
                onClick={() => setCustomStats(stats.filter((item) => item.id !== stat.id))}
              >
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </Surface>
        <form
          onSubmit={submit}
          className="flex flex-wrap items-start gap-2"
          aria-label="Add a statistic"
        >
          <Field label="Statistic" htmlFor="stat-name" error={error} className="w-56">
            <Input
              inputId="stat-name"
              value={label}
              onChange={setLabel}
              placeholder="e.g. Goals"
              valid={error === null}
            />
          </Field>
          <Field label="Short label" htmlFor="stat-short" className="w-24">
            <Input
              inputId="stat-short"
              value={short}
              onChange={setShort}
              placeholder={label ? shortLabelFromLabel(label) : 'Short'}
              maxLength={4}
            />
          </Field>
          <ActionButton type="submit" intent="primary" disabled={!label.trim()} className="mt-5">
            <Plus />
            Add
          </ActionButton>
        </form>
      </div>
    </Scroll>
  );
}
