# Picta

Picta puts local media on the display you choose.

```text
Drop media → choose a display → Start
```

It is a small filesystem-first desktop utility. It can rotate images and local
MP4/WebM videos, optionally load a reusable team, and render a live board or an
operator-triggered player cue beside or over the normal program.

## Simple use

1. Open Picta and drop PNG, JPEG, WebP, MP4 or WebM files into **Media**.
2. Choose a physical output in **Output**.
3. Choose a scene, pick **Full**, **Half + Half**, or another layout, and press
   **Start Output**.

The controller stays usable while the output window is live. Previous, Next,
Show Now and Stop affect only the selected Picta output. The presentation window
has no controls, dialogs or browser error pages.

Images are decoded before they become visible. Videos use the native operating
system WebView/media stack, advance on their ended event, and are removed and
stopped when skipped. Picta deliberately supports only `.mp4` and `.webm`; local
playback still depends on codecs available to the operating system WebView. Picta
does not bundle FFmpeg, a codec pack, Chromium, or a private WebView2 runtime.

## Displays and safety

Picta lists the display name, size, scale and desktop position. **Identify
Displays** briefly numbers every screen. It remembers a display hint rather than
trusting a list index, and refuses to guess when identical monitors are
ambiguous.

If the chosen display disappears, Picta stops playback, closes the presentation
window and leaves the controller usable. It never moves the output onto another
screen automatically. When the same display returns with a confident match,
choose it again and resume explicitly.

Windows is designed for portable use: copy `Picta.exe` anywhere and run it
without an installer, registry changes or administrator rights. Windows builds
use the WebView2 runtime already installed by the operating system; the bundle
does not include WebView2.

## Media Sets

The Media tab can keep media inline in a show or save a reusable `.pictaset`
file. Sets preserve order, image duration, transition and fit/fill sizing.
Videos play through once; image duration does not affect videos. Media files are
never copied. A missing-file notice can relink moved files from one folder.

The media menu includes New, Open, Save, Save As and Reveal in Finder/Explorer.
Dragging a `.pictaset` onto the Media tab loads it; dropping ordinary supported
media appends it.

## Players and sports

The Players tab is optional. Create or open a `.pictateam` with a name, sport,
colors, persistent player IDs, photos, intro videos, reusable groups and
player-specific featured statistics. Event counters and live-group overrides
belong to the current `.picta` show, not the reusable team file.

Picta ships small definitions for volleyball, basketball, soccer, football,
baseball and softball, plus simple custom counters. Volleyball keeps raw kills,
errors, attempts, assists, aces, service errors, digs and block counters;
hitting percentage, total blocks and points are derived. Recording a kill or
attack error also records an attempt. Other sports intentionally expose useful
starter counters rather than attempting to be complete scorebooks.

Groups can be edited and reordered. **Play in Order** queues each player's
intro video when available and falls back to the same canonical player card
builder used by individual and manual presentation. **Present Manually** opens
a runtime-only lineup session: each player row can be presented once, shown
players get a checkmark, and the operator can undo, end or replay the session.
A manual session never dirties the show or team file. A missing or unsupported
video never creates an output-side error.

## Scenes, layouts and cues

Scenes are reusable show configurations. Each scene has a stable id, unique
case-insensitive name, recursive layout, optional live-board group and
background. New, duplicate, rename, delete and default-scene actions change the
saved show; clicking a scene while output is live switches the running output
without changing the `.picta` file's dirty state. Scene changes preserve a
full-board cue, while a Program cue is ended cleanly before the new scene is
shown.

Layouts are recursive proportional split trees, not saved pixel rectangles. They
always contain exactly one **Program** zone and at most four zones. Other roles
are **Live Board**, **Media** and **Blank**. The Output preview uses the selected
display's actual dimensions, including portrait and ultrawide displays.

Built-in layouts are:

- Full Program
- Half + Half: Program and Live Board
- Program 2/3 + Board 1/3
- Board 1/3 + Program 2/3
- Custom tiled splits with role assignment and merge controls

The controller preview has an explicit **Edit Zones** mode. Normal Output
stays compact; only the edit mode exposes split, merge, role and divider
controls. It edits a draft session, shows exact output dimensions and a safe
area, and sends a read-only physical-display diagnostic preview with solid
role colors, zone number/id, dimensions and area share. **Cancel** leaves the
scene and output untouched. **Done** commits the scene once and resumes the
same background item with a fresh interval. The saved layout remains recursive
and ratio-based; no pixel rectangles are persisted.

For example, Half + Half resolves to 1920 × 1080 zones on a 3840 × 1080 board.
The same saved layout scales to another resolution without gaps or overlaps.

Player cards, images, player videos and queued group playback are cues. A cue
temporarily takes priority over Program, pauses background advancement, then
returns to the same background item with a fresh interval. Media-only zones keep
showing their background, and mirrored video zones are muted so only the primary
Program path produces audio.

## Files

- [`.picta` format](docs/picta-format.md): v1 remains readable forever; v2 is
  the generalized show format with media/team resources, event state, scenes,
  layouts and background behavior.
- [`.pictateam` format](docs/pictateam-format.md): reusable portable teams.
- [`.pictaset` format](docs/pictaset-format.md): reusable ordered media.
- [Layout model](docs/layouts.md): recursive zones and exact geometry rules.

All formats are small, human-readable JSON. Paths are written relative to the
owning file whenever practical and use forward slashes on disk. Paths inside a
document are data: they must still be a supported extension and an existing
path is granted to the asset protocol individually. The app has no general
frontend filesystem permission.

## Offline behavior and updates

Picta has no accounts, cloud service, telemetry, remote images, CDN assets or
browser network capability. Update checking is notify-only and uses the existing
Rust-side release check; it never installs or replaces the portable executable.
It does not run while output is live.

## Building

Requirements are Node.js 20+, Rust stable, and the [Tauri v2 platform
prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev
npm run tauri build
```

Frontend verification:

```bash
npm run verify
npm run build
```

Native verification when Rust is installed:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Picta is MIT licensed; see [LICENSE](LICENSE).
