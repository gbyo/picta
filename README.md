# Picta

Picta is an offline-first show-control console for a second display. Its primary workflow is a school sporting event run from a laptop: rotating local media, a readable volleyball score, live player statistics and player introductions on a wide video scoretable.

## The operator console

Picta opens on the **Console**. The window is one production workspace, not a set of pages:

- **Top bar**: the show and its save state, the four workspaces, the audience display, and the output state with **Go Live** / **Stop**. ON AIR is a red tally across the top of the window, a red status pill with the time on air, and a red frame around the program monitor. Nothing else in the app uses that red.
- **Program rail** (left, always visible, resizable): a faithful miniature of the audience display at the display's real aspect ratio, the **Screen switcher**, the cue on air, and either the media transport and rundown (when live) or a readiness checklist (when off air).
- **Workspace** (right): **Console**, **Media**, **Roster** or **Screens**. Switching workspace never hides what is on air.

### Console

The match sits on top: one large **Point** target per team (`Q` / `P`). A point gives that team the serve (rally scoring); a small **−** corrects a point without touching the serve. **Undo** (`Z`) names exactly what it will reverse. **End Set** shows its result before you press it; a regulation finish ends immediately with Undo, an unusual finish asks first. Set point, match point and the final result are called out; a finished match keeps the final rally score on the TV.

Below the match are **Stats** and **Cues** (side by side on a wide window, tabs on a narrow one).

- **Stats**: one tile per player in the live group with one button per statistic. A tap adds one (sport compound counters included, e.g. a kill also counts an attempt), right-click corrects, and `⇧Z` undoes the last stat. **Lineup** handles tonight's substitutions without touching the saved team.
- **Cues**: lineups to **Play in order** or present **Manually** (a player is marked shown only after the audience saw them), and any player's card or intro video. The deck says where cues will appear on the current Screen. A cue on air appears in the program rail with its progress and an End button (`Esc`); ending a cue never stops output.

### Media

A thumbnail grid of the rotation with an inspector. Drag to reorder (mouse, pen or touch), or `Alt`+arrows. Images use the rotation's default time or their own; videos play to the end. Missing files are flagged and relinked from one folder. Files that fail the WebView capability check are marked and skipped. The rotation is locked while ON AIR because the display is playing it; **Show Now** still works. Rotations can live inside the show or in a reusable `.pictaset`.

### Roster

A fast, inline-editable roster table: type a number and name, press Enter, repeat. **Paste Roster** imports a list from a spreadsheet or email with a preview first. The inspector sets photo, intro video, card statistics and groups. Groups are ordered and reorderable. Custom sports define their own statistics. Teams are reusable `.pictateam` files.

### Screens

A Screen is a complete audience composition of one to four non-overlapping panels showing Media, Score, Stats or Blank. The editor shows the composition on a canvas at the display's aspect ratio; click a panel to change what it shows, choose a template (Full, 50/50, 65/35, 35/65, top/bottom), set the background, and optionally show per-panel safe areas. Only one panel can show the rotation, so choosing Media moves it. Editing the Screen that is on air updates the display immediately, and says so. Imported layouts from older shows are kept exactly until a template is chosen.

## Keyboard

| Key | Action |
| --- | --- |
| `→` or `Space` | Next media (Space only when no button has focus) |
| `←` | Previous media |
| `Esc` | End the cue on air (never stops output) |
| `1`–`9` | Switch to Screen 1–9 (arms it while off air) |
| `Q` / `P` | Point to the left / right team |
| `Z` / `⇧Z` | Undo score / undo stat |
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘1`–`⌘4` | Console, Media, Roster, Screens |
| `?` | All shortcuts |

Shortcuts never fire while typing in a field or while a dialog, menu or popover has focus.

## Output reliability

Go Live is staged and shown as it happens: check the display, check media, prepare a hidden window on the chosen display, wait for the renderer, mount and acknowledge every panel, load the first media, then reveal and re-verify placement. Any failure closes the hidden window, stays OFF AIR and explains what happened in a banner. Session, panel, media and cue tokens prevent late events from an older run affecting the current one. Switching between Screens that share a media panel keeps the playing media; a cue whose panel disappears is ended cleanly. If the output display disconnects, Picta stops, closes the window and reselects the display only when it can identify it exactly. The output is never moved to another screen automatically.

## Files

- `.picta` shows (format v3; v1 and v2 are migrated in memory and only rewritten when saved). See [docs/picta-format-v3.md](docs/picta-format-v3.md).
- `.pictateam` reusable teams: [docs/pictateam-format.md](docs/pictateam-format.md).
- `.pictaset` reusable media rotations: [docs/pictaset-format.md](docs/pictaset-format.md).

New, Open, Save and Save As live in the native File menu and the show menu. Unsaved show, team and media changes are written to machine-local crash recovery and offered back at the next launch. Writes are atomic; Save As adopts a new path only after the write succeeds.

## Development

Requires Node.js 22.22+, Rust stable and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run dev          # browser preview with a simulated output and sample show
npm run tauri dev    # the desktop app
npm run verify       # format check, type check, tests
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

The controller is React 19, TypeScript, Vite, Tailwind CSS v4 and shadcn/ui components on Base UI, with Lucide icons, inside Tauri 2. The audience renderer (`present.html`) and the Identify overlay stay small standalone renderers. See [docs/controller.md](docs/controller.md) for the architecture.

Picta has no cloud service, telemetry, CDN assets or runtime network requirement. Update checks are notify-only, run in Rust, and never run while output is live.
