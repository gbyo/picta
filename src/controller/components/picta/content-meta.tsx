import { ChartColumn, Image, Square, Trophy, type LucideIcon } from 'lucide-react';
import type { PanelContent } from '@core/domain.js';

/** One vocabulary for panel content everywhere in the controller. */
export const CONTENT_META: Record<
  PanelContent['kind'],
  { label: string; icon: LucideIcon; hint: string; tint: string }
> = {
  media: {
    label: 'Media',
    icon: Image,
    hint: 'The media rotation. Cues appear here.',
    tint: 'bg-[oklch(0.42_0.06_250)]',
  },
  score: {
    label: 'Score',
    icon: Trophy,
    hint: 'The live volleyball score.',
    tint: 'bg-[oklch(0.38_0.05_160)]',
  },
  stats: {
    label: 'Stats',
    icon: ChartColumn,
    hint: 'A player statistics board for one group.',
    tint: 'bg-[oklch(0.40_0.05_300)]',
  },
  blank: {
    label: 'Blank',
    icon: Square,
    hint: 'The Screen background colour.',
    tint: 'bg-[oklch(0.30_0_0)]',
  },
};
