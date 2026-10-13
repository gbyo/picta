import { Clapperboard, Gauge, LayoutTemplate, Users, type LucideIcon } from 'lucide-react';
import type { Mode } from '@/state/store';

export const MODES: { id: Mode; label: string; icon: LucideIcon; key: string; hint: string }[] = [
  { id: 'console', label: 'Console', icon: Gauge, key: '1', hint: 'Run the event' },
  { id: 'media', label: 'Media', icon: Clapperboard, key: '2', hint: 'Build the media rotation' },
  { id: 'roster', label: 'Roster', icon: Users, key: '3', hint: 'Team, players and groups' },
  {
    id: 'screens',
    label: 'Screens',
    icon: LayoutTemplate,
    key: '4',
    hint: 'Design what the audience sees',
  },
];
