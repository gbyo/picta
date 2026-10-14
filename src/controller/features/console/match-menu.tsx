import { ArrowLeftRight, RotateCcw, SlidersHorizontal, SquarePen } from 'lucide-react';
import type { VolleyballScoreState } from '@core/domain.js';
import { OverflowMenu, MenuItem, MenuSeparator } from '@/components/picta/menu';
import { resetMatch, scoreAction } from '@/actions/match';
import { useDialogHost } from '@/components/picta/dialog';
import { CorrectScoreDialog, MatchSetupDialog } from './match-dialogs';

/**
 * The match's overflow menu: a few understandable tasks. Anything with fields
 * opens a dialog instead of putting settings inside the menu.
 */
export function MatchMenu({ score }: { score: VolleyballScoreState }) {
  const dialog = useDialogHost<'setup' | 'correct'>();
  return (
    <>
      <OverflowMenu label="Match options">
        <MenuItem icon={<SlidersHorizontal />} onClick={() => dialog.open('setup')}>
          Match Setup…
        </MenuItem>
        <MenuItem icon={<SquarePen />} onClick={() => dialog.open('correct')}>
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
      {dialog.state?.value === 'setup' && (
        <MatchSetupDialog
          key={dialog.state.key}
          score={score}
          onClose={dialog.closeFor(dialog.state.key)}
        />
      )}
      {dialog.state?.value === 'correct' && (
        <CorrectScoreDialog
          key={dialog.state.key}
          score={score}
          onClose={dialog.closeFor(dialog.state.key)}
        />
      )}
    </>
  );
}
