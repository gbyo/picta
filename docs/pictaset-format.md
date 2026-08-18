# The `.pictaset` format

`.pictaset` is a reusable ordered collection of local images and videos.

## Schema

```json
{
  "version": 1,
  "name": "Fall Sponsors",
  "items": [
    { "id": "media-1", "type": "image", "path": "Images/acme.png" },
    {
      "id": "media-2",
      "type": "video",
      "path": "Videos/community.mp4",
      "durationSeconds": 14
    }
  ],
  "transition": "crossfade",
  "imageSizing": "fit",
  "imageDurationSeconds": 10
}
```

`version`, `name` and `items` are required. Each item has a persistent `id`, a
matching `type` (`image` or `video`) and a supported path. The array order is
the playback order. Optional `durationSeconds` is retained for per-item image
timing; videos advance from their native ended event and do not wait for this
value. The set-level image duration must be between 1 and 86,400 seconds.

Supported extensions are PNG, JPEG, WebP, MP4 and WebM. MOV, AVI, MKV, GIF,
PDF, SVG, audio files and remote URLs are not part of this format. Video
decoding depends on codecs exposed by the operating system WebView/media stack;
Picta does not bundle FFmpeg or a private decoder.

`transition` is `none` or `crossfade`; `imageSizing` is `fit` or `fill`. Image
changes are decode-before-show and use double buffering. A video is shown only
after it is ready enough to play, and failure skips it with a controller warning.

## Paths and missing media

Paths use forward slashes and are relative to the `.pictaset` file whenever
possible. Missing files do not make the set unopenable. The controller marks
them, offers folder-based relinking, and excludes them from playback until
fixed. It never displays a broken-media element on the output.

## Validation and compatibility

IDs must be non-empty and unique. The item type must agree with its extension;
durations must be finite and within the supported range. Invalid present fields
are rejected, unknown fields are ignored, and versions newer than 1 produce a
clear update message. Serialization is human-readable JSON with two-space
indentation and a trailing newline.
