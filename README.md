# Picta

Picta shows still images fullscreen on **one monitor you choose**, rotating them
on a timer, and leaves every other display completely alone.

```
Add images  →  Choose a display  →  Start
```

or later:

```
Open a saved .picta file  →  Choose a display  →  Start
```

That is the whole application.

## Why it exists

A computer often has several displays doing several jobs — a control monitor, a
scoreboard or stats package, and a screen or TV for images. Putting pictures on
that third screen and only that screen is surprisingly awkward with a photo
viewer or a slideshow app: they open on the wrong monitor, they wander when a
cable is unplugged, and they need an installer and admin rights you may not have
on the machine in the booth.

Picta does that one job. It is a single portable executable on Windows, it never
touches the internet, and it will refuse to start a show rather than guess which
screen you meant.

## Supported operating systems

| Platform | Status                                                                           |
| -------- | -------------------------------------------------------------------------------- |
| Windows  | First class. Windows 10 and 11, x64 (and ARM64). Portable `Picta.exe`.           |
| macOS    | Supported, modern versions. `.dmg`.                                              |
| Linux    | Supported where the desktop allows a program to place its own windows. AppImage. |

## Portable Windows usage

```
Download Picta.exe  →  copy it anywhere  →  double-click it  →  use it
```

No installer. No administrator rights. No registry changes. It runs from a USB
stick, a network share or a folder on the desktop, and it leaves nothing behind
except a small preferences file in your own user profile.

Picta uses the **WebView2 runtime that is already part of Windows 11 and modern
Windows 10** rather than shipping its own copy. That is what keeps the download
a few megabytes instead of a few hundred. If a machine is old enough to be
missing it, install Microsoft's free
[Evergreen WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
once.

You can also open a show straight from the command line:

```bat
Picta.exe Basketball.picta
```

File associations are not part of v1 — that would need registry changes, and
portable use comes first.

## Adding images

Two ways, both obvious:

- **Drag and drop** image files onto the Picta window.
- Click **Choose Images** for the normal system file picker.

Picta supports **PNG, JPEG and WebP**. Not video, audio, animated GIF, PDF,
PowerPoint or web pages.

Thumbnails appear in playback order. You can drag them to reorder, remove one
with the small × , or clear them all. With a thumbnail focused, **Alt + ←/→**
reorders from the keyboard.

Picta never copies your images anywhere. It only remembers where they are.

## Choosing a display

Every attached monitor is listed with what the system knows about it:

```
Display 1 — Built-in Display · 2560 × 1600 · 200% · Primary
Display 2 — DELL P2422H · 1920 × 1080
Display 3 — Samsung TV · 1920 × 1080
```

Displays are numbered left to right, then top to bottom, using their real
desktop coordinates — including negative ones, stacked arrangements and mixed
DPI. Nothing is reduced to "primary" and "secondary".

### Identify Displays

Click **Identify Displays** and a large number appears briefly on every screen,
matching the numbers in the list. It disappears on its own after about two
seconds, changes no monitor settings, and leaves no windows behind.

### Picta will not guess which screen you meant

This is the part worth trusting. Monitor numbering is not an identity: unplug a
TV and everything after it is renumbered. So Picta remembers the _display_, not
its position in a list, using the name, resolution and scale factor the system
reports.

- If the show's display disappears while running, playback **stops**, the
  presentation window is closed immediately, and the controller says so. The
  show is never moved onto your scoreboard.
- If the display comes back and can be identified with confidence, a **Resume**
  button appears.
- If two identical monitors make the match ambiguous, Picta asks you to choose
  rather than picking one.

## Fit vs Fill

- **Fit** (default) — the whole image is visible; unused screen area is black.
- **Fill** — the image covers the screen and may be cropped at the edges.

Aspect ratio is never distorted.

## None vs Crossfade

- **Crossfade** (default) — a 300 ms dissolve between images.
- **None** — the next image replaces the current one directly.

Either way, an image is only put on screen after it has fully decoded, so there
are no white flashes, black flashes or broken-image icons on the output display.
The fade length is not configurable; two options is the whole feature.

## Timing

Pick how long each image stays up: 3, 5, 10 (default), 15, 20, 30 or 60 seconds.
Playback loops forever — there is no loop switch, because that is simply how
Picta works.

While a show is running the controller shows which display it is on and how far
through it is, with **Previous**, **Next** and **Stop**. Pressing Previous or
Next gives the new image a fresh full interval.

**←** previous, **→** or **Space** next, **Esc** stop. These work while Picta is
focused. Picta registers no global hotkeys, so it can never swallow a keystroke
meant for your scoreboard or stats software.

## Saving and opening `.picta` files

**File → New / Open… / Save / Save As…** saves a show as a small `.picta` file:

```
Football Ads.picta
Morning Announcements.picta
Lobby.picta
```

It stores the image list and order, the interval, the transition and the sizing.
It does not store the images themselves, or anything about your monitors.

If you try to close, open something else or start over with unsaved changes,
Picta offers **Save / Don't Save / Cancel**.

### Relative paths make a show portable

Where possible, Picta stores image paths **relative to the `.picta` file**:

```
Basketball/
├── Basketball.picta      stores "Images/bank.png"
└── Images/
    ├── bank.png
    └── pizza.png
```

Move that whole folder to another drive, a USB stick or another computer and the
show still works. Images stored elsewhere fall back to absolute paths.

The format is documented in [docs/picta-format.md](docs/picta-format.md).

### When images have moved

Opening a show whose images have moved gives you a short notice:

```
2 images couldn't be found.
[ Locate Images ]  [ Remove Missing ]
```

**Locate Images** asks for one folder and relinks everything it can find there —
if ten images moved together, one dialog fixes all ten. Nothing about a missing
image is ever shown on the presentation display.

## Volleyball stats and player takeovers

Optional, and collapsed out of the way unless you use it. Picta's main job is
still images on a screen; this is for the case where the screen is showing
sponsor graphics at a volleyball match and you want to put a player up on it.

Open **Volleyball Stats**, add players (jersey number, name, position), and keep
the box score during the match:

```
7  Avery Chen                      OH   [ Show ]
   12 K · 4 A · 6 D · 2 SA · .333
```

Tap a player to open their counters. **Kill**, **Error** and **Attempt** each
record an attack attempt as well, so hitting percentage stays correct without you
having to remember to press two buttons during a rally; every counter has a `−`
to undo a mis-tap. Assists, aces, service errors, digs and blocks get plain
`+`/`−` steppers.

Picta stores only raw counts and derives the rest using the ordinary conventions
— hitting percentage `(K − E) ÷ TA`, an assisted block as half a block, points as
`K + SA + BS + BA/2`. A player who has not attacked has no hitting percentage
rather than `.000`.

### Show

While a show is running, **Show** beside a player sweeps a card across the output
display with their number, name and stats, holds it for about nine seconds, then
sweeps away and carries on with the images.

The image underneath is never disturbed and the rotation is paused for the
duration, so the show comes back on the same image it left — with a fresh full
interval, since you have just been looking at something else. **Back to Images**
(or **Esc**) returns early. While a card is up, **Esc** means "back to the
images", not "stop the show".

**Reset Stats** clears every counter and keeps the roster, which is what starting
a new match means.

The roster is saved inside the `.picta` file, so a team's roster and a match's
stats travel with the show. A `.picta` file with no roster is byte-for-byte what
it was before this feature existed.

## Update notifications

Picta tells you when a newer version has been released. It does **not** install
anything — it checks the version number on GitHub and shows one line:

```
Picta 1.1.0 is available. You are running 1.0.0.
[ What's New ]  [ Not Now ]
```

**What's New** opens the releases page in your browser so you can read the notes
and download the new `Picta.exe` yourself. **Not Now** silences that one version;
the next release is still announced.

This is deliberately notify-only. Picta is usually a portable executable running
on a machine in a booth that somebody else owns, often minutes before an event.
Silently replacing that file is not a favour, so replacing it stays your
decision.

The check happens once when the controller opens and at most once a day after
that. It is **never** made while a show is running — nothing gets to interrupt
images on an output display. It is a single request to
`api.github.com/repos/gbyo/picta/releases/latest`, made by the Rust side against
a compile-time URL, so the interface itself has no network capability and cannot
be pointed anywhere else. If the machine is offline, behind a firewall or on a
locked-down school network, the check fails silently and Picta behaves exactly as
it always does.

To switch it off entirely, untick **Check for Updates Automatically** (in the
**Help** menu on Windows and Linux, the **Picta** menu on macOS). With it off,
Picta makes no network requests at all. **Check for Updates…** in the same menu
runs a check on demand.

## Otherwise entirely offline

Apart from that one version check, Picta does not use the network. No telemetry,
no analytics, no accounts, no cloud, no CDN fonts or scripts, no remote images.
The Content Security Policy blocks remote content outright and the interface has
no HTTP permission of its own. It uses system fonts.

The only file access Picta has is through its own commands, which accept
`.picta` documents and PNG/JPEG/WebP images and nothing else.

## Building from source

Requirements: [Rust](https://rustup.rs) (stable) and Node.js 20+, plus the usual
[Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your
platform.

```bash
npm install
npm run tauri dev      # run in development
npm run tauri build    # production build
```

Verification:

```bash
npm run verify                              # format check, typecheck, unit tests
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

On Windows the portable executable is `src-tauri/target/release/Picta.exe`; copy
it out and it is the whole application. Use `npm run tauri build -- --no-bundle`
if you only want that file.

## Current limitations

- **One presentation output at a time.** Picta drives a single display.
- **Still images only.** No video, audio, animated GIF, PDF, PowerPoint, web
  pages or remote URLs. The player takeover card is the one thing Picta draws
  itself.
- **Volleyball only, for stats.** The stat set is the volleyball box score. There
  is no other sport, and no scoreboard, clock or set score — Picta is not trying
  to replace your stats package.
- **Takeover needs a running show.** The card sweeps over the images in the
  presentation window, so there has to be one. Start the show first.
- **Linux window placement depends on the desktop.** X11 sessions behave as
  expected. Under Wayland, applications are not permitted to position their own
  windows, so Picta cannot reliably put the presentation on a chosen monitor;
  it falls back to the compositor's placement and will report if it could not
  confirm the target display. An X11 session is recommended for multi-monitor
  use.
- **No file associations.** Double-clicking a `.picta` file is not wired up in
  the portable build; use **Open…** or pass the path on the command line.
- **No auto-install of updates.** Picta tells you a new version exists; you
  download and replace the executable yourself. Tauri's official updater cannot
  update a portable `.exe` — it works by running an NSIS or MSI installer — and
  portable use comes first.
- **Monitor identity is best-effort.** It relies on what the OS reports. Two
  identical monitors of the same model and resolution can be indistinguishable;
  in that case Picta asks rather than guesses.

## License

MIT. See [LICENSE](LICENSE).
