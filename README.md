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
3. Choose the scene to start with and press **Start Output**. Layouts are built
   inside **Edit Zones**, not from the normal Output screen.

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

Groups can be edited and reordered. Every presentation path — **Play in Order**,
**Present Manually** and a single preferred presentation — uses the same
canonical player cue, so the same player produces the same output no matter who
decided to show them. Only the choice of who goes next differs.

Presentation intent is explicit and deterministic:

- **Show Card** always shows the player card, even when an intro video exists.
- **Play Intro Video** always attempts the video. If there is none, or it fails,
  the controller says so rather than quietly showing a card.
- Preferred presentation plays the intro video when it is usable and falls back
  to the player card only if that video fails.

**Present Manually** turns the Players tab into a runtime-only lineup workspace:
setup controls collapse, and each row reads number → name → position. A shown
player keeps its checkmark but stays clickable, so a repeated announcement is
one click away from a replay — a replay does not change the shown count or the
first-shown order. **Undo Last** unmarks the most recently first-presented
player and **End Lineup** returns to the normal roster UI.

A player is marked shown only after Picta successfully presented something, so a
corrupt video never produces a checkmark. A manual session never dirties the
show or team file, and never reorders the saved group. A missing or unsupported
video never creates an output-side error.

## Scenes, layouts and cues

Scenes are reusable show configurations. Each scene has a stable id, unique
case-insensitive name, recursive layout, optional live-board group and
background.

Switching scenes and managing them are deliberately separate. While output is
live, a compact **Scene** strip sits in the sticky header and does one thing:
switch the scene the board is using, from any tab. That is a runtime operation
and never changes the `.picta` file's dirty state. When output is stopped the
strip disappears, so image-only Picta stays simple.

Scene management lives in Output, behind a **⋯** menu: new, duplicate, rename,
set as default, move left/right and delete. Those change the saved show. The
default scene is marked with a small ★ and is the initial selection when a show
is created, opened or stopped; **Start Output** then starts whichever scene is
visibly selected, and the Output tab says which one that is. Scene order is
saved and is also the order of the live scene buttons. The scene on the board
cannot be deleted, and neither can the last remaining scene.

Scene changes preserve a full-board cue, while a Program cue is ended cleanly
before the new scene is shown.

Layouts are recursive proportional split trees, not saved pixel rectangles. They
always contain exactly one **Program** zone and at most four zones. Other roles
are **Live Board**, **Media** and **Blank**. The Output preview uses the selected
display's actual dimensions, including portrait and ultrawide displays.

Layout building happens only inside the explicit **Edit Zones** mode, which
lives in Output next to the layout it edits. Normal Output shows the scene's
preview and a single **Edit Zones** button — there are no destructive preset
buttons that mutate a scene outside the draft. Starting zone editing from
another tab switches to Output first, so the board never enters calibration mode
with Done and Cancel out of sight.

Inside the editor, **Start from** offers the built-in layouts:

- Full Program
- Half + Half: Program and Live Board
- 2/3 + 1/3
- Board 1/3 + Program 2/3

Choosing one changes the draft only. From there, split a zone left/right or
top/bottom, assign a role, drag a divider or merge a leaf with its sibling. Any
layout becomes custom simply by being split, resized or re-roled.

Preview zones are real buttons: tab to one, press Enter or Space, and focus is
visible. Zones are named for the operator — "Zone 2 · Live Board" — rather than
by internal id; ids stay stable but stay internal.

The optional safe-area overlay is drawn **per zone**, so on a 3840 × 1080
half-and-half wall each 1920 × 1080 zone gets its own roughly 4.5% inset rather
than one rectangle inset from the whole canvas. It is preview-only and is never
saved.

While output is live, Edit Zones only edits the scene the board is actually
using; selecting a different scene offers an explicit **Switch to …** action
first, so the active and edited scenes can never disagree. **Cancel** leaves the
scene and output untouched. **Done** commits the scene once and resumes the same
background item with a fresh interval. The saved layout remains recursive and
ratio-based; no pixel rectangles are persisted.

For example, Half + Half resolves to 1920 × 1080 zones on a 3840 × 1080 board.
The same saved layout scales to another resolution without gaps or overlaps.

Player cards, images, player videos and queued group playback are cues. A cue
temporarily takes priority over Program, pauses background advancement, then
returns to the same background item with a fresh interval. Media-only zones keep
showing their background, and mirrored video zones are muted so only the primary
Program path produces audio.

One playback engine runs underneath, but the controls describe the operation
rather than the queue. An ordered lineup shows its name, its position in the
sequence and Previous / Next / End Lineup. A single manually chosen player has
no "next", so it gets only **End Player**. A single Show Now media cue gets
**End**. The live status line says what Picta believes is on the board —
`● LIVE · Game · Starting Lineup 3/6`, `● LIVE · Game · #14 Dana Whitfield` —
and failures are reported in the controller, never on the output screen.

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
