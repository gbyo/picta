import { useState } from 'react';
import { ArrowLeftRight, RotateCcw, SlidersHorizontal, SquarePen } from 'lucide-react';
import type { VolleyballScoreState } from '@core/domain.js';
import { OverflowMenu, MenuItem, MenuSeparator } from '@/components/picta/menu';
import { resetMatch, scoreAction } from '@/actions/match';
import { CorrectScoreDialog, MatchSetupDialog } from './match-dialogs';

/**
 * The match's overflow menu: a few understandable tasks. Anything with fields
 * opens a dialog instead of putting settings inside the menu.
 */
export function MatchMenu({ score }: { score: VolleyballScoreState }) {
  const [dialog, setDialog] = useState<'setup' | 'correct' | null>(null);
  return (
    <>
      <OverflowMenu label="Match options">
        <MenuItem icon={<SlidersHorizontal />} onClick={() => setDialog('setup')}>
          Match Setup…
        </MenuItem>
        <MenuItem icon={<SquarePen />} onClick={() => setDialog('correct')}>
          Correct Score…
        </MenuItem>
        <MenuItem icon={<ArrowLeftRight />} onClick={() => scoreAction({ type: 'swap-sides' })}>
          Swap Sides
        </MenuItem>
        <MenuSeparator />
        <MenuItem destructive icon={<RotateCcw />} onClick={() => void resetMatch()}>
          Reset Match…
        </MenuItem>
      </OverflowMenu>
      {dialog === 'setup' && <MatchSetupDialog score={score} onClose={() => setDialog(null)} />}
      {dialog === 'correct' && <CorrectScoreDialog score={score} onClose={() => setDialog(null)} />}
    </>
  );
}
