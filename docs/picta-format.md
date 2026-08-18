# The `.picta` file format

Version 1.

A `.picta` file describes a show: which images, in which order, and how to
display them. It is a small, human-readable JSON document. It contains no image
data, no thumbnails, and nothing specific to the machine that wrote it.

`.picta` is treated as a public file format. Version 1 will not change
incompatibly; anything new will arrive as an optional field or a new version
number.

## Example

```json
{
  "version": 1,
  "images": [{ "path": "Images/acme.png" }, { "path": "Images/bank.jpg" }],
  "intervalSeconds": 10,
  "transition": "crossfade",
  "imageSizing": "fit"
}
```

## Schema

| Field             | Type                      | Required | Default       | Meaning                                       |
| ----------------- | ------------------------- | -------- | ------------- | --------------------------------------------- |
| `version`         | integer                   | yes      | —             | Format version. Currently `1`.                |
| `images`          | array of objects          | yes      | —             | Ordered playlist. May be empty.               |
| `images[].path`   | non-empty string          | yes      | —             | Path to one image (see **Paths**).            |
| `intervalSeconds` | number, 1–86400           | no       | `10`          | Seconds each image stays on screen.           |
| `transition`      | `"none"` \| `"crossfade"` | no       | `"crossfade"` | How one image replaces the next.              |
| `imageSizing`     | `"fit"` \| `"fill"`       | no       | `"fit"`       | How each image fills the display.             |
| `roster`          | array of objects          | no       | absent        | Volleyball roster and stats (see **Roster**). |

The array order **is** the playback order.

Supported image types are PNG, JPEG and WebP. A path naming anything else simply
fails to load and is skipped at playback time.

## Layout

`full` shows one image filling the display. `split` divides it in half: the image
rotation on the left, a live on-court stats panel on the right. It is additive —
a reader that ignores it shows the images full screen, which is a correct way to
play the show.

## Roster

`roster` is optional and additive. It carries no format version bump, because a
reader that ignores it still plays the show correctly — which is exactly the case the "ignore unknown fields" rule exists
for. Picta omits the field entirely when the roster is empty, so an ordinary
image show is byte-for-byte what it was before rosters existed.

```json
{
  "version": 1,
  "images": [{ "path": "Images/sponsor.png" }],
  "intervalSeconds": 10,
  "transition": "crossfade",
  "imageSizing": "fit",
  "roster": [
    {
      "number": "7",
      "name": "Avery Chen",
      "position": "OH",
      "stats": { "kills": 12, "attackErrors": 2, "attempts": 30, "digs": 6 }
    },
    { "number": "3", "name": "Jordan Ruiz", "position": "S", "stats": { "assists": 21 } }
  ]
}
```

| Field      | Type             | Required | Default | Meaning                        |
| ---------- | ---------------- | -------- | ------- | ------------------------------ |
| `name`     | non-empty string | yes      | —       | Player name.                   |
| `number`   | string or number | no       | `""`    | Jersey number. See below.      |
| `position` | string           | no       | `""`    | Free text, e.g. `"OH"`, `"S"`. |
| `stats`    | object           | no       | all `0` | Counters (see below).          |

`number` is kept as **text**, because `"0"` and `"00"` are different players and
a leading zero is part of a jersey number. A JSON number is accepted and
converted, so `7` and `"7"` both work.

### Stat counters

Every counter is a non-negative integer and every one is optional; an omitted
counter is zero. Picta writes only the non-zero ones.

| Key             | Box score | Meaning                                            |
| --------------- | --------- | -------------------------------------------------- |
| `kills`         | K         | Attacks that ended the rally in this team's favour |
| `attackErrors`  | E         | Attacks that ended the rally against this team     |
| `attempts`      | TA        | Every attack attempted, kills and errors included  |
| `assists`       | A         | Assists                                            |
| `aces`          | SA        | Service aces                                       |
| `serviceErrors` | SE        | Service errors                                     |
| `digs`          | D         | Digs                                               |
| `blockSolos`    | BS        | Blocks won alone                                   |
| `blockAssists`  | BA        | Blocks shared with a teammate                      |

**Only raw counts are stored.** Hitting percentage, total blocks and points are
derived on read, using the ordinary conventions:

```
hitting %     = (kills − attackErrors) ÷ attempts     (no value when attempts = 0)
total blocks  = blockSolos + blockAssists ÷ 2
points        = kills + aces + blockSolos + blockAssists ÷ 2
```

Storing a derived figure is how a box score ends up contradicting itself, so a
`.picta` file never contains one. Note that `attempts` must include kills and
errors for the hitting percentage to mean anything; Picta maintains this
automatically when stats are entered through its own interface.

Player ids are **not** stored. They only need to be unique within one running
copy of Picta, and generating them on read means a hand-written roster does not
have to invent any.

A malformed roster is an error with a message naming the entry, exactly like a
malformed image list. It is never silently dropped — losing a match's stats
quietly would be much worse than refusing to open the file.

### What is deliberately absent

A `.picta` file never stores image binary data, Base64 payloads, thumbnails,
monitor indexes or identifiers, the current playback position, or window
geometry. Those are either enormous, or facts about one particular computer that
would be wrong the moment the file was opened somewhere else. Picta keeps
machine-specific state in its own preferences file instead.

## Paths

Paths use forward slashes (`/`) regardless of the operating system that wrote
the file. Picta converts to the local convention when reading.

A path is stored **relative to the `.picta` file** whenever the two share a root
— the same drive letter on Windows, the same UNC share, or any absolute path on
macOS and Linux. Otherwise it falls back to an absolute path.

That makes a show portable. Given this layout:

```
Basketball/
├── Basketball.picta
└── Images/
    ├── bank.png
    ├── pizza.png
    └── school.png
```

Picta writes `Images/bank.png`, not `E:\Basketball\Images\bank.png`. The whole
folder can then be copied to another folder, another drive, a USB stick or
another computer, and the show still works.

Relative paths may contain `..` when images live beside the show folder rather
than inside it.

### Paths are data

A path in a `.picta` file is only ever resolved and handed to the image loader.
It cannot execute anything, and it cannot widen what Picta is allowed to read:
Picta's own file commands accept `.picta` documents and PNG/JPEG/WebP images and
nothing else, and the presentation window is only granted access to images that
actually exist and were named by an opened document, a file dialog or a relink.

## Reading a `.picta` file

An implementation should:

1. Parse the JSON. Malformed JSON is an error, never a crash.
2. Require `version` to be a positive integer.
3. Reject `version` greater than the highest it supports, and say so plainly:
   the file was written by a newer Picta.
4. Require `images` to be an array of objects each carrying a non-empty string
   `path`.
5. Reject a present-but-invalid `intervalSeconds`, `transition`, `imageSizing`,
   `layout` or `roster` rather than silently substituting the default. A wrong value
   usually means a hand-edit went wrong, and silently ignoring it hides the
   mistake.
6. Ignore unknown fields.
7. Resolve each path against the `.picta` file's own folder.
8. Report which images could not be found, without refusing to open the file.

Missing images do not make a document invalid. Picta opens it, lists what it
could not find, and offers to relink or remove those entries.

## Writing a `.picta` file

Write `version: 1`, the six core fields, `roster` only when it is non-empty,
two-space indentation and a trailing newline. Keeping the output stable and readable means a `.picta` file diffs
cleanly in version control.
