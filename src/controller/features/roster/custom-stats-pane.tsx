import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { shortLabelFromLabel, statIdFromLabel } from '@core/custom-stats.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
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
  };

  return (
    <div className="flex max-w-2xl flex-col gap-3 p-4">
      <p className="text-[12px] text-fg-muted">
        {custom.name} counts these statistics. The first four appear on the stats board and player
        cards by default.
      </p>
      <ol className="flex flex-col rounded-md border border-line">
        {stats.length === 0 && (
          <li className="px-3 py-3 text-[12px] text-fg-faint">No statistics yet.</li>
        )}
        {stats.map((stat, index) => (
          <li
            key={stat.id}
            className="flex h-9 items-center gap-3 border-b border-line px-3 last:border-b-0"
          >
            <span className="w-4 text-[10.5px] text-fg-faint tabular">{index + 1}</span>
            <span className="w-12 text-[12px] font-semibold text-fg">{stat.shortLabel}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{stat.label}</span>
            <span className="text-[11px] text-fg-faint">{stat.id}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${stat.label}`}
              onClick={() => setCustomStats(stats.filter((item) => item.id !== stat.id))}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ol>
      <form
        onSubmit={submit}
        className="flex flex-wrap items-start gap-2"
        aria-label="Add a statistic"
      >
        <div className="flex flex-col gap-1">
          <Input
            value={label}
            onChange={(event) => setLabel(event.currentTarget.value)}
            placeholder="Statistic, e.g. Goals"
            aria-label="Statistic name"
            className="w-56"
            aria-invalid={error !== null}
          />
          {error && <span className="text-[11.5px] text-danger">{error}</span>}
        </div>
        <Input
          value={short}
          onChange={(event) => setShort(event.currentTarget.value)}
          placeholder={label ? shortLabelFromLabel(label) : 'Short'}
          aria-label="Short label"
          maxLength={4}
          className="w-20"
        />
        <Button type="submit" variant="primary" disabled={!label.trim()}>
          <Plus />
          Add
        </Button>
      </form>
    </div>
  );
}
