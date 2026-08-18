# The `.picta` format

`.picta` is a small, human-readable JSON show document. It contains references
to local files and show/event state, never media bytes, thumbnails, monitor
indexes or window geometry.

## Version 1: preserved forever

The public v1 shape remains readable and is not redefined incompatibly:

```json
{
  "version": 1,
  "images": [{ "path": "Images/acme.png" }],
  "intervalSeconds": 10,
  "transition": "crossfade",
  "imageSizing": "fit",
  "layout": "full",
  "roster": []
}
```

V1 accepts PNG, JPEG and WebP image paths, an empty image list, `full` or
`split`, and the original optional volleyball roster fields. The v1 parser
continues to reject a newer version clearly. When the application opens a v1
file, it migrates it in memory; saving writes v2 and does not overwrite the
source until the operator chooses Save.

Migration preserves image order, missing paths, interval, transition, sizing,
full/split layout, roster names/numbers/positions, raw counters and on-court
state. The old `blocks` counter becomes the generalized volleyball
`blockSolos` counter. V1 files are never silently discarded or rewritten just
by opening them.

V1's optional fields retain their original meanings: `intervalSeconds` is
1–86,400 seconds, `transition` is `none` or `crossfade`, `imageSizing` is
`fit` or `fill`, and `layout` is `full` or `split`. A roster entry has a
non-empty `name`, a text-or-number `number`, optional `position`, optional
non-negative integer `stats`, and optional `onCourt: true`. The original raw
stat keys are `kills`, `assists`, `digs` and `blocks`; derived values are never
stored. Invalid present fields are rejected, unknown fields are ignored, and
missing image files remain relinkable rather than making the document invalid.

## Version 2

V2 generalizes the show around reusable media and teams:

```json
{
  "version": 2,
  "media": {
    "kind": "inline",
    "data": {
      "version": 1,
      "name": "Fall Sponsors",
      "items": [
        { "id": "media-1", "type": "image", "path": "Images/acme.png" },
        { "id": "media-2", "type": "video", "path": "Videos/spot.mp4" }
      ],
      "transition": "crossfade",
      "imageSizing": "fit",
      "imageDurationSeconds": 10
    }
  },
  "team": { "kind": "file", "path": "Teams/wildcats.pictateam" },
  "event": {
    "stats": { "player-7": { "kills": 12, "digs": 6 } },
    "liveGroups": { "on-court": ["player-7"] }
  },
  "layout": {
    "type": "split",
    "direction": "columns",
    "ratio": 0.5,
    "first": { "type": "zone", "id": "program", "role": "program" },
    "second": { "type": "zone", "id": "live-board", "role": "live-board" }
  },
  "liveBoardGroupId": "on-court",
  "background": { "kind": "black" }
}
```

`media` and `team` can be `inline` resources or `file` resources. A file
resource may carry already-loaded `data` in memory, but the serializer writes
only its path. Linked `.pictaset` and `.pictateam` paths must use those
extensions. Event statistics are generic raw counters keyed by persistent
player ID; live groups are keyed by persistent group ID. A v2 parser validates
references when the team is inline and rejects invalid layouts, resources,
stats, colors and background values.

The v2 show layout is documented in [layouts.md](layouts.md). Team and media
resource schemas are documented in [pictateam-format.md](pictateam-format.md)
and [pictaset-format.md](pictaset-format.md).

## Paths and missing files

Paths use `/` in saved JSON. Picta resolves them relative to the owning file
when possible, using absolute paths only when the files are outside a shared
root. Relative paths may contain `..`. Missing paths do not invalidate an
otherwise valid show: the controller marks them missing, offers folder-based
relinking, and never displays a broken-media state on the output window.

Supported media extensions are deliberately limited to:

```text
png jpg jpeg webp mp4 webm
```

Video decoding is supplied by the operating system WebView/media stack. The
format does not imply that every OS codec is available, and Picta does not
bundle FFmpeg or another decoder.

## Compatibility rules

The parser requires a positive integer version and rejects versions newer than
the supported version with an actionable message. Present-but-invalid fields
are errors rather than silent defaults. Unknown fields are ignored so additive
minor fields remain readable. Serializers use two-space indentation and a
trailing newline for stable diffs.
