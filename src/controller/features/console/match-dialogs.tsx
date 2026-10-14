import { useState } from 'react';
import { Button, ColorPicker, Input, NumberField } from '@cladd-ui/react';
import type { MatchFormat, ScoreSide, VolleyballScoreState } from '@core/domain.js';
import { matchSetLimit, sideSets } from '@core/score.js';
import { ActionButton, Choice, Field } from '@/components/picta/controls';
import { ModalDialog } from '@/components/picta/dialog';
import { InspectorSection, PropertyRow } from '@/components/picta/workspace';
import { scoreAction } from '@/actions/match';

const SIDES: { side: ScoreSide; label: string }[] = [
  { side: 'home', label: 'Left team' },
  { side: 'away', label: 'Right team' },
];

/**
 * Match setup: the format and how each team appears on the scoreboard.
 * Changes apply together when confirmed, each as its own Undo step.
 */
export function MatchSetupDialog({
  score,
  onClose,
}: {
  score: VolleyballScoreState;
  onClose(): void;
}) {
  const [format, setFormat] = useState<MatchFormat>(score.matchFormat);
  const [teams, setTeams] = useState({
    home: { name: score.home.name, color: score.home.primaryColor },
    away: { name: score.away.name, color: score.away.primaryColor },
  });
  const apply = () => {
    if (format !== score.matchFormat) scoreAction({ type: 'match-format', value: format });
    for (const { side } of SIDES) {
      if (teams[side].name !== score[side].name)
        scoreAction({ type: 'team-name', side, value: teams[side].name });
      if (teams[side].color !== score[side].primaryColor)
        scoreAction({ type: 'team-color', side, value: teams[side].color });
    }
    onClose();
  };
  return (
    <ModalDialog
      onOpenChange={(open) => !open && onClose()}
      title="Match setup"
      text="Format and how each team appears on the scoreboard."
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <ActionButton intent="primary" type="submit" form="match-setup-form">
            Apply
          </ActionButton>
        </>
      }
    >
      <form
        id="match-setup-form"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <InspectorSection title="Format">
          <Choice<MatchFormat>
            label="Match format"
            stretch
            value={format}
            onChange={setFormat}
            options={[
              { value: 'best-of-5', label: 'Best of 5 · first to 3' },
              { value: 'best-of-3', label: 'Best of 3 · first to 2' },
            ]}
          />
        </InspectorSection>
        <InspectorSection title="Teams">
          {SIDES.map(({ side, label }) => (
            <div key={side} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <Field label={label} htmlFor={`team-name-${side}`}>
                <Input
                  inputId={`team-name-${side}`}
                  value={teams[side].name}
                  maxLength={40}
                  onChange={(name) => setTeams({ ...teams, [side]: { ...teams[side], name } })}
                />
              </Field>
              <ColorPicker
                surface="cut"
                dropdownIcon={false}
                aria-label={`${label} colour`}
                value={teams[side].color}
                onChange={(next) =>
                  setTeams({ ...teams, [side]: { ...teams[side], color: next.hex } })
                }
                className="w-28"
              />
            </div>
          ))}
        </InspectorSection>
      </form>
    </ModalDialog>
  );
}

/**
 * Corrections for a mistake already made: the set number, each team's sets
 * won and who is serving. Points are corrected with − on the team itself.
 */
export function CorrectScoreDialog({
  score,
  onClose,
}: {
  score: VolleyballScoreState;
  onClose(): void;
}) {
  const [setNumber, setSetNumber] = useState(score.setNumber);
  const [sets, setSets] = useState({
    home: sideSets(score, 'home'),
    away: sideSets(score, 'away'),
  });
  const [serving, setServing] = useState<ScoreSide | 'none'>(score.serving ?? 'none');
  const apply = () => {
    if (setNumber !== score.setNumber) scoreAction({ type: 'set-number', value: setNumber });
    for (const { side } of SIDES)
      if (sets[side] !== sideSets(score, side))
        scoreAction({ type: 'sets-won', side, value: sets[side] });
    if (serving !== (score.serving ?? 'none'))
      scoreAction({ type: 'serve', side: serving === 'none' ? null : serving });
    onClose();
  };
  return (
    <ModalDialog
      onOpenChange={(open) => !open && onClose()}
      title="Correct score"
      text="Fix the set number, sets won or serve. Each change is one Undo step."
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <ActionButton intent="primary" onClick={apply}>
            Apply
          </ActionButton>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <PropertyRow label="Set number">
          <NumberField
            min={1}
            max={matchSetLimit(score)}
            value={setNumber}
            onChange={setSetNumber}
            className="w-full max-w-36"
          />
        </PropertyRow>
        {SIDES.map(({ side }) => (
          <PropertyRow key={side} label={`${score[side].name} sets`}>
            <NumberField
              min={0}
              max={Math.ceil(matchSetLimit(score) / 2)}
              value={sets[side]}
              onChange={(value) => setSets({ ...sets, [side]: value })}
              className="w-full max-w-36"
            />
          </PropertyRow>
        ))}
        <PropertyRow label="Serving">
          <Choice<ScoreSide | 'none'>
            label="Serving"
            value={serving}
            onChange={setServing}
            options={[
              { value: 'home', label: 'Left' },
              { value: 'away', label: 'Right' },
              { value: 'none', label: 'Nobody' },
            ]}
          />
        </PropertyRow>
      </div>
    </ModalDialog>
  );
}
