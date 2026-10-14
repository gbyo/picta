import { useState } from 'react';
import { Button, Tab, TabPanel, Tabs, TabsList } from '@cladd-ui/react';
import {
  ChartColumn,
  ClipboardPaste,
  FilePlus2,
  FolderOpen,
  FolderSearch,
  ListOrdered,
  Save,
  Users,
} from 'lucide-react';
import { basename } from '@core/paths.js';
import { ActionButton, CommitInput } from '@/components/picta/controls';
import { EmptyState } from '@/components/picta/feedback';
import { OverflowMenu } from '@/components/picta/menu';
import { ResourceMenuItems, type ResourceAction } from '@/components/picta/resource-menu';
import {
  Workspace,
  WorkspaceBody,
  WorkspaceHeader,
  WorkspaceToolbar,
} from '@/components/picta/workspace';
import { usePicta } from '@/state/store';
import { useDefinition, useTeam } from '@/hooks';
import { createNewTeam, openTeam, reveal, saveTeam } from '@/actions/document';
import { locateMissingTeamMedia, renameTeam } from '@/actions/team';
import { PlayersPane } from './players-pane';
import { GroupsPane } from './groups-pane';
import { CustomStatsPane } from './custom-stats-pane';
import { PasteRosterDialog } from './paste-roster-dialog';

/** The team's file actions: everything about where the team lives. */
function TeamFileMenu() {
  const filePath = usePicta((state) => state.doc.teamFilePath);
  const groups: ResourceAction[][] = [
    [
      { id: 'new', label: 'New Team…', icon: FilePlus2, onSelect: () => void createNewTeam() },
      { id: 'open', label: 'Open Team…', icon: FolderOpen, onSelect: () => void openTeam() },
    ],
    [
      {
        id: 'save',
        label: filePath ? 'Save Team' : 'Save as Team File…',
        icon: Save,
        onSelect: () => void saveTeam(),
      },
      ...(filePath
        ? [
            {
              id: 'save-as',
              label: 'Save Team As…',
              icon: Save,
              onSelect: () => void saveTeam(true),
            },
          ]
        : []),
      {
        id: 'reveal',
        label: 'Reveal Team File',
        icon: FolderSearch,
        disabled: !filePath,
        onSelect: () => void reveal('team'),
      },
    ],
    [
      {
        id: 'locate',
        label: 'Locate Missing Photos & Videos…',
        icon: FolderSearch,
        onSelect: () => void locateMissingTeamMedia(),
      },
    ],
  ];
  return (
    <OverflowMenu label="Team file">
      <ResourceMenuItems groups={groups} />
    </OverflowMenu>
  );
}

/** Team setup: who is on the roster, how they are presented, and the groups. */
export function RosterWorkspace() {
  const team = useTeam();
  const definition = useDefinition();
  const filePath = usePicta((state) => state.doc.teamFilePath);
  const dirty = usePicta((state) => state.doc.teamDirty);
  const style = usePicta((state) => state.pathStyle);
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
            <ActionButton intent="primary" onClick={() => void createNewTeam()}>
              <FilePlus2 />
              New Team…
            </ActionButton>
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
    <Workspace>
      <WorkspaceHeader
        title={
          <CommitInput
            variant="inline"
            label="Team name"
            value={team.name}
            onCommit={renameTeam}
            maxLength={60}
            autoWidth
            className="h-cladd-lg max-w-72 text-cladd-sm font-semibold"
          />
        }
        meta={
          <>
            {definition.name} · {team.players.length} player{team.players.length === 1 ? '' : 's'}
            {missingMedia > 0 && (
              <span className="text-danger"> · {missingMedia} with missing media</span>
            )}
            <span>
              {' · '}
              {filePath ? basename(filePath, style) : 'stored in show'}
              {dirty && <span className="text-warn"> · unsaved</span>}
            </span>
          </>
        }
        actions={
          <Button onClick={() => setPasting(true)}>
            <ClipboardPaste />
            Paste Roster…
          </Button>
        }
        menu={<TeamFileMenu />}
      />
      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <WorkspaceToolbar>
          <TabsList>
            <Tab value="players">
              <Users />
              Players
            </Tab>
            <Tab value="groups">
              <ListOrdered />
              Groups
              <span className="text-cladd-fg-softer tabular">{team.groups.length}</span>
            </Tab>
            {team.sport === 'custom' && (
              <Tab value="stats">
                <ChartColumn />
                Statistics
              </Tab>
            )}
          </TabsList>
        </WorkspaceToolbar>
        <WorkspaceBody>
          <TabPanel
            value="players"
            className="flex min-h-0 min-w-0 flex-1 outline-none @max-[560px]/ws:flex-none @max-[560px]/ws:flex-col"
          >
            <PlayersPane />
          </TabPanel>
          <TabPanel
            value="groups"
            className="flex min-h-0 min-w-0 flex-1 outline-none @max-[560px]/ws:flex-none @max-[560px]/ws:flex-col"
          >
            <GroupsPane />
          </TabPanel>
          {team.sport === 'custom' && (
            <TabPanel
              value="stats"
              className="flex min-h-0 min-w-0 flex-1 outline-none @max-[560px]/ws:flex-none @max-[560px]/ws:flex-col"
            >
              <CustomStatsPane />
            </TabPanel>
          )}
        </WorkspaceBody>
      </Tabs>
      <PasteRosterDialog open={pasting} onOpenChange={setPasting} />
    </Workspace>
  );
}
