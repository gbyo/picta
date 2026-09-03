# Picta 2.0

Picta is an offline-first show-control console for a second display. Its primary workflow is a high-school volleyball video score table: rotating local media on the left and a readable score or six-player statistics board on the right.

## Live workflow

Picta opens on **Live**. A normal event takes four setup actions: add Media, create or open a Team when player features are needed, enter the opponent on Live, and choose a display. **Go Live** prepares the output invisibly and reveals it only after the Screen and initial media are ready.

The Live console keeps the audience preview, saved Screen switcher, media Previous/Next controls, output status, and score/stat controls together. The default **Media + Score** Screen is a true 50/50 composition. **Media + Stats** changes the right panel without advancing or reconstructing a shared left media panel.

Volleyball score controls cover points, serving side, set number, sets won, Best of 3/5 state, confirmed End Set, Undo, side swapping, and confirmed match reset. Picta does not guess set completion or replace an official scorebook.

Best of 5 is first to three sets; Best of 3 is first to two. Normal sets are to 25 and the deciding set to 15, both win by two. End Set warns before a nonstandard finish, preserving operator control for local rules. Ending the match keeps the final rally score visible instead of clearing it or advancing to a sixth set. Undo remains available.

### A TV viewed from across the court

Choose **Full Score** from the Live Screen switcher for maximum distance readability. It gives both teams large side-by-side scores on a 16:9 TV. **Media + Score** retains the requested rotating-media/score split, but necessarily reduces the physical size of the score. Scores use white heavy numerals on a solid dark background; team colors are accents, never the score text background. Fonts scale with the panel at 1080p and 4K without fixed pixel caps. The operator preview uses the exact same score markup and styling as output.

Verify from the farthest intended seat on the actual TV before the event; resolution alone cannot guarantee readability at a particular distance. If names or sets are too small, use Full Score, shorten the display names, or use a larger/closer display. The browser-only sizing fixture at `/tests/fixtures/scoreboard.html?layout=full` (or `half`) is available with `npm run dev`.

## Screens and Panels

A **Screen** is a complete output composition. It contains one to four flat, normalized rectangular **Panels**, each assigned Media, Score, Stats, or Blank content. New volleyball shows include:

- Media + Score (default)
- Media + Stats
- Full Media
- Full Score
- Full Stats

The Screens editor offers Full, 50/50 left-right, 65/35, 35/65, and 50/50 top-bottom templates. At 1920×1080 and 3840×1080, 50/50 panels resolve to exact 960-pixel and 1920-pixel halves respectively.

## Files and migration

Picta 2.0 writes `.picta` format v3. It still reads v1, v2, and the earlier single-layout v2 shape. Old recursive layouts are resolved and flattened in memory; unusual three- and four-panel geometry is retained as an imported layout until the operator explicitly resets it to a template. Loading an older file never overwrites it automatically. Portable `.pictateam` and `.pictaset` formats remain unchanged, and match score stays in the show rather than the reusable team.

Writes are atomic. Unsaved show, Team, and Media changes use machine-local crash recovery. Save As adopts a new path only after the dialog and write succeed.

## Output reliability

Output starts in stages: prepare a hidden WebView on the selected display, correlate renderer readiness, mount and acknowledge every Screen panel, load initial score/stats/media, then reveal and reverify the physical window. A failed stage closes the hidden presentation and leaves Picta OFF AIR. Session, panel, media, and cue tokens prevent late events from an older operation affecting current output.

The Media playlist structure is locked while output is live. Previous, Next, and explicit cues remain available. Internal ordering uses pointer capture rather than HTML drag-and-drop, which avoids conflicts with Tauri file importing on Windows and supports mouse, pen, touch, and keyboard alternatives.

## Keyboard behavior

- `Left Arrow`: previous media while live
- `Right Arrow` or `Space`: next media, except while a button or field owns the key
- `Escape`: end the active cue; it never stops the entire output
- Tab and Shift+Tab: move through controls
- Screen and panel buttons, template choices, score controls, and reorder alternatives are keyboard accessible

## Development

```sh
npm ci
npm run verify
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Picta uses TypeScript, Vite, and Tauri. It has no cloud, telemetry, FFmpeg, or runtime network requirement; update checks are the only optional network activity.
