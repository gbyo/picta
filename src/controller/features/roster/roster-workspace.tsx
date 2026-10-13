import { useState } from 'react';
import {
  ChevronDown,
  ClipboardPaste,
  FilePlus2,
  FolderOpen,
  FolderSearch,
  ListOrdered,
  Save,
  ChartColumn,
  Users,
} from 'lucide-react';
import { basename } from '@core/paths.js';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/picta/section';
import { usePicta } from '@/state/store';
import { useDefinition, useTeam } from '@/hooks';
import { createNewTeam, openTeam, reveal, saveTeam } from '@/actions/document';
import { locateMissingTeamMedia, renameTeam, setTeamColor } from '@/actions/team';
import { PlayersPane } from './players-pane';
import { GroupsPane } from './groups-pane';
import { CustomStatsPane } from './custom-stats-pane';
import { PasteRosterDialog } from './paste-roster-dialog';

function TeamName({ name }: { name: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      aria-label="Team name"
      value={draft ?? name}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        if (draft !== null) renameTeam(draft);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
      className="h-8 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-[15px] font-semibold text-fg outline-none hover:border-line-strong focus:border-accent focus:bg-sunken"
      style={{ width: `${Math.max(8, (draft ?? name).length + 2)}ch` }}
    />
  );
}

function ColorSwatch({ which, color }: { which: 'primary' | 'secondary'; color: string }) {
  return (
    <label
      className="relative block size-6 cursor-pointer overflow-hidden rounded-[5px] ring-1 ring-line-strong"
      style={{ background: color }}
    >
      <input
        type="color"
        aria-label={which === 'primary' ? 'Primary team colour' : 'Secondary team colour'}
        defaultValue={color}
        key={color}
        onBlur={(event) => setTeamColor(which, event.currentTarget.value)}
        onChange={(event) => {
          // Commit when the native picker closes; preview the swatch live.
          event.currentTarget.parentElement!.style.background = event.currentTarget.value;
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function TeamMenu() {
  const filePath = usePicta((state) => state.doc.teamFilePath);
  const dirty = usePicta((state) => state.doc.teamDirty);
  const style = usePicta((state) => state.pathStyle);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-1.5 text-fg-muted" />}>
        {dirty && <span className="size-1.5 rounded-full bg-warn" aria-label="Unsaved" />}
        {filePath ? basename(filePath, style) : 'stored in show'}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {filePath
            ? 'A reusable .pictateam file.'
            : 'Stored inside the show. Save it as a .pictateam to reuse it.'}
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => void createNewTeam()}>
          <FilePlus2 />
          New Team…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void openTeam()}>
          <FolderOpen />
          Open Team…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void saveTeam()}>
          <Save />
          {filePath ? 'Save Team' : 'Save as Team File…'}
        </DropdownMenuItem>
        {filePath && (
          <DropdownMenuItem onClick={() => void saveTeam(true)}>
            <Save />
            Save Team As…
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={!filePath} onClick={() => void reveal('team')}>
          <FolderSearch />
          Reveal Team File
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void locateMissingTeamMedia()}>
          <FolderSearch />
          Locate Missing Photos & Videos…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Team setup: who is on the roster, how they are presented, and the groups. */
export function RosterWorkspace() {
  const team = useTeam();
  const definition = useDefinition();
  const [tab, setTab] = useState<'players' | 'groups' | 'stats'>('players');
  const [pasting, setPasting] = useState(false);

  if (!team || !definition)
    return (
      <EmptyState
        className="h-full"
        icon={<Users />}
        title="No team in this show"
        actions={
          <>
            <Button variant="primary" onClick={() => void createNewTeam()}>
              <FilePlus2 />
              New Team…
            </Button>
            <Button onClick={() => void openTeam()}>
              <FolderOpen />
              Open Team…
            </Button>
          </>
        }
      >
        A team is optional. Add one for live statistics, player cards, intro videos and lineup
        introductions. Teams are reusable .pictateam files, so you build a roster once a season.
      </EmptyState>
    );

  const missingMedia = team.players.filter(
    (player) => player.media.photo?.missing || player.media.introVideo?.missing,
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <ColorSwatch which="primary" color={team.colors.primary} />
        <ColorSwatch which="secondary" color={team.colors.secondary} />
        <TeamName name={team.name} />
        <span className="text-[12px] text-fg-faint">
          {definition.name} · {team.players.length} player{team.players.length === 1 ? '' : 's'}
          {missingMedia > 0 && (
            <span className="text-danger"> · {missingMedia} with missing media</span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {tab === 'players' && (
            <Button variant="ghost" onClick={() => setPasting(true)}>
              <ClipboardPaste />
              Paste Roster…
            </Button>
          )}
          <TeamMenu />
        </div>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
        className="min-h-0 flex-1"
      >
        <TabsList className="border-b border-line px-3">
          <TabsTrigger value="players">
            <Users />
            Players
          </TabsTrigger>
          <TabsTrigger value="groups">
            <ListOrdered />
            Groups
            <span className="text-fg-faint tabular">{team.groups.length}</span>
          </TabsTrigger>
          {team.sport === 'custom' && (
            <TabsTrigger value="stats">
              <ChartColumn />
              Statistics
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="players" className="min-h-0">
          <PlayersPane />
        </TabsContent>
        <TabsContent value="groups" className="min-h-0">
          <GroupsPane />
        </TabsContent>
        {team.sport === 'custom' && (
          <TabsContent value="stats" className="min-h-0">
            <CustomStatsPane />
          </TabsContent>
        )}
      </Tabs>
      <PasteRosterDialog open={pasting} onOpenChange={setPasting} />
    </div>
  );
}
