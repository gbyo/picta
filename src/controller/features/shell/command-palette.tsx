import type { ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleStop,
  FilePlus2,
  FolderOpen,
  Hand,
  IdCard,
  Image,
  LayoutTemplate,
  Play,
  Plus,
  Radio,
  Save,
  ScanEye,
  Square,
  Trophy,
  Undo2,
  Users,
} from 'lucide-react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { Keys } from '@/components/picta/hint';
import { usePicta } from '@/state/store';
import { scoreInUse } from '@/state/derive';
import { openPalette, setMode } from '@/actions/ui';
import {
  goLive,
  identifyDisplays,
  nextMedia,
  previousMedia,
  requestStopOutput,
  selectScreen,
} from '@/actions/output';
import { newShow, openShow, saveShow } from '@/actions/document';
import { chooseAndAddMedia } from '@/actions/media';
import { endSet, rally, undoScoreAction, scoreAction } from '@/actions/match';
import {
  beginManualLineup,
  endCue,
  playGroupInOrder,
  playerLabel,
  presentSinglePlayer,
} from '@/actions/cues';
import { MODES } from './modes';
import { mod } from '@/shortcuts';

function Item({
  value,
  onSelect,
  icon,
  children,
  keys,
  disabled,
}: {
  value: string;
  onSelect(): void;
  icon: ReactNode;
  children: ReactNode;
  keys?: string[] | undefined;
  disabled?: boolean;
}) {
  return (
    <CommandItem
      value={value}
      disabled={disabled ?? false}
      onSelect={() => {
        openPalette(false);
        // Let the palette close before the action opens anything else.
        setTimeout(onSelect, 0);
      }}
    >
      {icon}
      <span className="truncate">{children}</span>
      {keys && (
        <CommandShortcut>
          <Keys keys={keys} />
        </CommandShortcut>
      )}
    </CommandItem>
  );
}

export function CommandPalette() {
  const open = usePicta((state) => state.paletteOpen);
  const phase = usePicta((state) => state.output.phase);
  const screens = usePicta((state) => state.doc.show.data.screens);
  const liveScreenId = usePicta((state) => state.output.liveScreenId);
  const team = usePicta((state) => state.doc.show.data.team?.data);
  const showScore = usePicta((state) => scoreInUse(state.doc.show.data));
  const score = usePicta((state) => state.doc.show.data.event.score);
  const cueActive = usePicta((state) => state.output.cue.state.active);
  const live = phase === 'live';

  return (
    <CommandDialog open={open} onOpenChange={(value) => openPalette(value)} title="Command palette">
      <Command loop>
        <CommandInput placeholder="Type a command, Screen or player…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Output">
            {live ? (
              <Item
                value="stop output off air"
                onSelect={() => void requestStopOutput()}
                icon={<CircleStop />}
              >
                Stop Output…
              </Item>
            ) : (
              <Item
                value="go live on air start output"
                onSelect={() => void goLive()}
                icon={<Radio />}
                disabled={phase !== 'off'}
              >
                Go Live
              </Item>
            )}
            {live && (
              <>
                <Item value="next media" onSelect={nextMedia} icon={<ChevronRight />} keys={['→']}>
                  Next Media
                </Item>
                <Item
                  value="previous media"
                  onSelect={previousMedia}
                  icon={<ChevronLeft />}
                  keys={['←']}
                >
                  Previous Media
                </Item>
              </>
            )}
            {cueActive && (
              <Item value="end cue" onSelect={endCue} icon={<Square />} keys={['Esc']}>
                End Cue
              </Item>
            )}
            <Item
              value="identify displays"
              onSelect={() => void identifyDisplays()}
              icon={<ScanEye />}
            >
              Identify Displays
            </Item>
          </CommandGroup>
          <CommandGroup heading={live ? 'Switch Screen' : 'Go live with Screen'}>
            {screens.map((screen, index) => (
              <Item
                key={screen.id}
                value={`screen ${screen.name}`}
                onSelect={() => selectScreen(screen.id)}
                icon={<LayoutTemplate />}
                keys={index < 9 ? [String(index + 1)] : undefined}
              >
                {screen.name}
                {screen.id === liveScreenId ? ' · on air' : ''}
              </Item>
            ))}
          </CommandGroup>
          {showScore && score && (
            <CommandGroup heading="Score">
              <Item
                value={`point ${score.home.name} left`}
                onSelect={() => rally('home')}
                icon={<Plus />}
                keys={['Q']}
              >
                Point · {score.home.name}
              </Item>
              <Item
                value={`point ${score.away.name} right`}
                onSelect={() => rally('away')}
                icon={<Plus />}
                keys={['P']}
              >
                Point · {score.away.name}
              </Item>
              <Item value="undo score" onSelect={undoScoreAction} icon={<Undo2 />} keys={['Z']}>
                Undo Score
              </Item>
              <Item value="end set" onSelect={() => void endSet()} icon={<Trophy />}>
                End Set…
              </Item>
              <Item
                value="swap sides"
                onSelect={() => scoreAction({ type: 'swap-sides' })}
                icon={<Trophy />}
              >
                Swap Sides
              </Item>
            </CommandGroup>
          )}
          {team && (
            <CommandGroup heading="Cues">
              {team.groups.map((group) => (
                <Item
                  key={`order-${group.id}`}
                  value={`play lineup ${group.name} in order`}
                  onSelect={() => void playGroupInOrder(group)}
                  icon={<Play />}
                  disabled={!live}
                >
                  Play {group.name} in Order
                </Item>
              ))}
              {team.groups.map((group) => (
                <Item
                  key={`manual-${group.id}`}
                  value={`present ${group.name} manually`}
                  onSelect={() => beginManualLineup(group)}
                  icon={<Hand />}
                  disabled={!live}
                >
                  Present {group.name} Manually
                </Item>
              ))}
              {team.players.map((player) => (
                <Item
                  key={`card-${player.id}`}
                  value={`card ${player.number} ${player.name}`}
                  onSelect={() => void presentSinglePlayer(player.id, 'card')}
                  icon={<IdCard />}
                  disabled={!live}
                >
                  Show Card · {playerLabel(player)}
                </Item>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Go to">
            {MODES.map((mode) => (
              <Item
                key={mode.id}
                value={`go to ${mode.label}`}
                onSelect={() => setMode(mode.id)}
                icon={<mode.icon />}
                keys={[mod.replace('+', ''), mode.key]}
              >
                {mode.label}
              </Item>
            ))}
          </CommandGroup>
          <CommandGroup heading="Show">
            <Item value="new show" onSelect={() => void newShow()} icon={<FilePlus2 />}>
              New Show
            </Item>
            <Item value="open show" onSelect={() => void openShow()} icon={<FolderOpen />}>
              Open Show…
            </Item>
            <Item value="save show" onSelect={() => void saveShow()} icon={<Save />}>
              Save Show
            </Item>
            <Item
              value="add media"
              onSelect={() => void chooseAndAddMedia()}
              icon={<Image />}
              disabled={phase !== 'off'}
            >
              Add Media…
            </Item>
            {!team && (
              <Item value="team roster" onSelect={() => setMode('roster')} icon={<Users />}>
                Set Up a Team…
              </Item>
            )}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
