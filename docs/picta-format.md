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

| Field             | Type              | Required | Default      | Meaning                                      |
| ----------------- | ----------------- | -------- | ------------ | -------------------------------------------- |
| `version`         | integer           | yes      | —            | Format version. Currently `1`.               |
| `images`          | array of objects  | yes      | —            | Ordered playlist. May be empty.              |
| `images[].path`   | non-empty string  | yes      | —            | Path to one image (see **Paths**).           |
| `intervalSeconds` | number, 1–86400   | no       | `10`         | Seconds each image stays on screen.          |
| `transition`      | `"none"` \| `"crossfade"` | no | `"crossfade"` | How one image replaces the next.      |
| `imageSizing`     | `"fit"` \| `"fill"` | no     | `"fit"`      | How each image fills the display.            |

The array order **is** the playback order.

Supported image types are PNG, JPEG and WebP. A path naming anything else simply
fails to load and is skipped at playback time.

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
5. Reject a present-but-invalid `intervalSeconds`, `transition` or `imageSizing`
   rather than silently substituting the default. A wrong value usually means a
   hand-edit went wrong, and silently ignoring it hides the mistake.
6. Ignore unknown fields.
7. Resolve each path against the `.picta` file's own folder.
8. Report which images could not be found, without refusing to open the file.

Missing images do not make a document invalid. Picta opens it, lists what it
could not find, and offers to relink or remove those entries.

## Writing a `.picta` file

Write `version: 1`, all five fields, two-space indentation and a trailing
newline. Keeping the output stable and readable means a `.picta` file diffs
cleanly in version control.
