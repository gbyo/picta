# Picta output layouts

The `.picta` show stores a proportional recursive split tree. It never stores
absolute pixel rectangles, so the same layout works on a 3840 × 1080 ultrawide,
a 1920 × 1080 display, a 4K display or a portrait monitor.

## Nodes

```ts
type LayoutNode = ZoneNode | SplitNode;

interface ZoneNode {
  type: 'zone';
  id: string;
  role: 'program' | 'live-board' | 'media' | 'blank';
}

interface SplitNode {
  type: 'split';
  direction: 'columns' | 'rows';
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
}
```

`columns` means left/right and `rows` means top/bottom. `ratio` is the share
given to `first`, clamped and validated between 0.1 and 0.9. The current format
allows at most four zones, exactly one Program zone, no duplicate IDs, and no
empty child. A valid tree fills its parent completely; it cannot overlap or
leave a gap.

## Zone roles

- **Program**: exactly one. Normal Media Set playback and operator cues appear
  here.
- **Live Board**: controller-formatted team/player rows and columns.
- **Media**: background Media Set only. Mirrored videos are muted.
- **Blank**: a solid black or selected team-color surface.

Player cards and full-board player/video cues temporarily cover the output while
the background remains logically paused. Media-only zones continue showing the
background during a Program cue.

## Built-in presets

```text
Full                    Program
Half + Half             Program 0.5 | Live Board 0.5
Program 2/3 + Board     Program 0.666… | Live Board 0.333…
Board 1/3 + Program     Live Board 0.333… | Program 0.666…
```

On a 3840 × 1080 output, Half + Half resolves to two exact 1920 × 1080 zones;
Program 2/3 + Board resolves to 2560 × 1080 and 1280 × 1080. Integer rounding
always gives the second child the remainder, so adjacent edges meet exactly on
odd dimensions too. Geometry is pure and is used by the controller preview and
tests.

## Custom layouts

Layout building lives entirely inside the explicit **Edit Zones** mode, in the
Output tab. Normal Output shows the scene's layout preview and a single
**Edit Zones** button; there are no destructive preset buttons outside the
draft. Starting zone editing from another tab switches to Output first, so the
operator never puts the physical board into calibration mode and then has to
hunt for Done or Cancel.

Inside the editor, the presets above act as **Start from** choices that change
the draft only, so Cancel restores the exact original scene. From there, select
a zone, split it left/right or top/bottom, assign a role, drag a divider or
merge a selected leaf with its sibling. Any layout becomes custom simply by
being split, resized or re-roled, so "custom" is a description rather than a
choice.

While output is live, Edit Zones only edits the scene the board is actually
using. Selecting a different scene in Output offers an explicit
**Switch to …** action first, so the active scene and the edited scene can
never disagree.

The controller and physical display show the draft as a diagnostic preview with
solid role colors, an operator-facing zone number and role, and exact
dimensions. Internal zone ids stay stable but stay internal. The optional
safe-area overlay is drawn **per zone**: on a 3840 × 1080 half-and-half wall
each 1920 × 1080 zone gets its own roughly 4.5% inset rather than one rectangle
inset from the whole canvas. The toggle is preview-only and is never persisted.
The physical preview has no controls or pointer handling and normal media/cue
audio is stopped while it is visible.

Cancel discards the draft without dirtying the show. Done commits once and
resumes the same background item. It does not provide free-position boxes,
arbitrary overlaps, pixel coordinates or an unlimited compositor. Role routing
uses the zone's `role`, not legacy ids such as `program` or `live-board`, so
custom ids remain safe.
