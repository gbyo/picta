# Picta

**Game-day production software for digital scorer's tables.**

Picta is a free, offline-first desktop application for running media, scoring, player statistics, and introductions on digital scorer's tables.

Built primarily with **Sideline Interactive LED scorer's tables** in mind, Picta gives schools and athletic programs a modern way to manage what fans see courtside, without relying on a cloud service or an internet connection.

From sponsor rotations between plays to live volleyball scoring and player introductions, everything is controlled from one operator console.

## What Picta does

- **Media & sponsorships** — Run images, videos, advertisements, and other game-day content in an automatically advancing rotation.
- **Live scoring** — Track volleyball scores, sets, and serving possession with fast controls designed for use during a match.
- **Player statistics** — Record and display individual player stats as the game progresses.
- **Player introductions** — Present player cards, lineup sequences, and introduction videos directly on the scorer's table.
- **Custom screen layouts** — Combine media, scores, and statistics in different areas of the display.
- **Live output monitoring** — See exactly what's being shown to the audience without leaving the controls.
- **Offline operation** — Keep the entire show running locally, even without internet access.

Picta is designed for the wide, short display formats commonly found on LED scorer's tables, rather than assuming every display is a conventional television.

## The operator console

Picta opens directly into a single production workspace. The goal is simple: an operator should be able to run an entire game without navigating between disconnected windows or losing sight of what's on the table.

The interface is organized into four workspaces: **Console, Media, Roster, and Screens**.

A persistent program monitor remains visible as you move between them.

### Live output

The program rail displays a live preview of the audience output, preserving the scorer's table's actual aspect ratio.

It also provides:

- The currently selected Screen and an immediate Screen switcher.
- The active media item or player introduction.
- Media playback controls and the upcoming rotation.
- An output readiness checklist before going live.
- A clear indication of whether the display is live.

Press **Go Live** to start presenting on the selected external display. When Picta is live, the interface shows a distinctive red ON AIR indicator, elapsed time, and a red border around the program monitor.

Stopping a player introduction or switching content does not stop the overall display output.

### Console

The Console is the primary workspace during a game.

**Volleyball scoring**

Each team has a large point control, accessible by mouse, touch, or keyboard.

Picta handles rally scoring, service possession, set results, and match progression. Operators can correct individual points or undo the last score action without accidentally modifying unrelated state.

Set point, match point, and final results are clearly indicated. The final score remains visible after the match ends.

**Live player statistics**

Track individual players through a grid of quick-access stat controls. Each action updates the active statistics, including related counters such as kills and attack attempts.

Statistics can be corrected or undone independently of the score. Temporary lineups and substitutions can be managed without modifying the saved team roster.

**Player introductions and cues**

Present individual player cards, introduction videos, and complete lineup sequences.

Lineups can run automatically in roster order or be advanced manually. Picta tracks which introductions actually appeared on the audience display.

Active cues show their progress in the program monitor and can be ended without interrupting the rest of the show.

### Media

Manage the content displayed on the scorer's table throughout the event.

Picta supports image and video rotations for sponsor advertisements, school branding, game-day announcements, and other visual content.

The Media workspace includes a thumbnail grid, drag-and-drop ordering, and an inspector for individual items.

Images can have custom display durations, while videos normally play to completion. Operators can immediately present a selected item using **Show Now**.

Media files are stored locally. Missing files can be identified and relinked, while unsupported media is flagged and skipped rather than disrupting playback.

Rotations can be stored inside a show or saved separately as reusable `.pictaset` files.

### Roster

Build and manage reusable team rosters for scoring, statistics, and introductions.

Players can be entered directly in an editable table or imported in bulk using **Paste Roster**, which previews pasted spreadsheet or text data before importing it.

Each player can have a number, name, photo, introduction video, statistics, and group assignments.

Groups make it possible to organize starters, substitutes, or other custom sequences. Their order can be adjusted for introductions.

Custom sports can define their own tracked statistics, while complete teams can be saved as reusable `.pictateam` files.

### Screens

A Screen defines how content is arranged across the scorer's table.

Each Screen can contain up to four non-overlapping panels displaying:

- Media
- Score
- Statistics
- Blank space

The visual editor previews the composition at the audience display's aspect ratio, including unusually wide scorer's table formats.

Start with Full, 50/50, 65/35, 35/65, or top/bottom layouts, then choose the content and background for each panel.

Optional safe-area guides help account for display boundaries.

A media rotation can appear in only one panel at a time. Changing its placement moves the rotation rather than duplicating it.

Screens can be switched during a show using the Screen switcher or keyboard shortcuts. Editing the currently active Screen updates the live output immediately, with a warning in the editor.

Imported legacy layouts remain unchanged until a new template is selected.

## Keyboard shortcuts

Picta is designed to be operated quickly during live events, including when the operator is managing scoring and media simultaneously.

| Shortcut | Action |
|---|---|
| `Space` / `→` | Next media item |
| `←` | Previous media item |
| `Q` / `P` | Add a point to the left / right team |
| `Z` | Undo the last score action |
| `Shift+Z` | Undo the last statistic action |
| `Esc` | End the active cue |
| `1`–`9` | Switch to Screen 1–9 |
| `Cmd/Ctrl+K` | Open the command palette |
| `Cmd+1`–`Cmd+4` | Switch workspaces |
| `?` | Show all keyboard shortcuts |

Shortcuts are suppressed while typing or interacting with dialogs, menus, and popovers. Space advances media only when no button has focus.

## Display support

Picta uses an external display as its audience output, allowing the operator to keep the console on their laptop while the scorer's table shows the program.

The application is designed around **wide-format LED scorer's tables**, particularly Sideline Interactive systems, but is not tied to one manufacturer.

The output composition adapts to the selected display's aspect ratio rather than forcing a standard 16:9 layout.

Picta requires the scorer's table or its associated display system to accept a compatible video output from the computer. It does not directly configure proprietary LED controllers or replace hardware-specific display configuration software.

Picta is an independent project and is not affiliated with or endorsed by Sideline Interactive.

## Output reliability

A scorer's table is a live display. Content should not unexpectedly disappear, switch monitors, or become stuck because of an unrelated interface action.

Picta uses a staged output startup process:

1. Verify the selected display and required media.
2. Prepare the audience window without showing it.
3. Wait for the renderer to become ready.
4. Load and confirm the required Screen panels and initial media.
5. Reveal the output and verify its display placement.

If startup fails, Picta remains OFF AIR and explains the problem.

During operation, session and playback identifiers prevent delayed renderer events from affecting a newer show state. Media playback can continue across Screens that share the same media panel, and cues are cleaned up when their destination panel disappears.

If the audience display disconnects, Picta closes the output rather than moving it to an unintended monitor. It only reselects a display when it can identify the original device.

## Shows and reusable files

Picta uses local files so a complete production can be prepared, saved, copied, and reused without depending on an online account.

| Format | Purpose |
|---|---|
| `.picta` | Complete show containing event configuration and content references |
| `.pictateam` | Reusable team rosters |
| `.pictaset` | Reusable media rotations |

Show files use format version 3. Older v1 and v2 shows are migrated in memory and rewritten only when saved.

File format documentation:

- [Show format](docs/picta-format-v3.md)
- [Team format](docs/pictateam-format.md)
- [Media set format](docs/pictaset-format.md)

New, Open, Save, and Save As are available through the native File menu and show menu.

Unsaved changes are stored in machine-local crash recovery and offered for restoration on the next launch. Files are written atomically to protect against incomplete saves.

## Development

Picta is built with Tauri 2, React 19, TypeScript, Vite, Tailwind CSS v4 and the Cladd (`@cladd-ui/react`) design system, with Lucide icons.

The audience output uses a separate lightweight renderer (`present.html`), keeping the presentation surface isolated from the operator interface.

For architectural details, see [docs/controller.md](docs/controller.md).

### Platform requirements

The operator interface is built on Cladd, which uses modern CSS: anchor positioning for popovers, menus and tooltips, and relative colour syntax for its themes. The audience output does not use either. Use a current WebView: WebView2 on Windows, a recent WebKit on macOS, and a current WebKitGTK on Linux. The Tauri bundle's `minimumSystemVersion` is not enough on its own to guarantee this on macOS.

### Requirements

- Node.js 22.22 or newer
- Rust stable
- [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/)

### Run locally

```sh
npm ci
npm run dev          # Browser preview with simulated output and sample show
npm run tauri dev    # Desktop application
```

### Verify and build

```sh
npm run verify
npm run build

cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Offline by design

Picta has no required cloud service, telemetry, CDN assets, or runtime network dependency.

Media, rosters, statistics, layouts, and show configurations are managed locally.

Optional update checks run through Rust, notify the operator when an update is available, and never run while output is live.

---

**Picta — built for the scorer's table, controlled from the sideline.**
