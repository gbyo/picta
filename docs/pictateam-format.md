# The `.pictateam` format

`.pictateam` is a reusable, portable team file. It stores roster identity and
presentation preferences, not tonight's event counters or substitutions.

## Schema

```json
{
  "version": 1,
  "id": "team-wildcats",
  "name": "Ninety Six Wildcats",
  "sport": "volleyball",
  "colors": { "primary": "#004b32", "secondary": "#ffffff" },
  "players": [
    {
      "id": "player-7",
      "number": "7",
      "name": "Avery Chen",
      "position": "OH",
      "media": {
        "photo": "Players/avery.png",
        "introVideo": "Players/avery.mp4"
      },
      "featuredStats": ["kills", "digs", "aces"]
    }
  ],
  "groups": [
    {
      "id": "starting-lineup",
      "name": "Starting Lineup",
      "playerIds": ["player-7"],
      "maxPlayers": 6
    }
  ]
}
```

Required top-level fields are `version`, `id`, `name`, `sport`, `colors`,
`players` and `groups`. Supported built-in sports are `volleyball`,
`basketball`, `soccer`, `football`, `baseball` and `softball`. A `custom` team
also carries a `customSport` object with simple `positions` and `stats`
definitions (`id`, `label`, `shortLabel`).

Player IDs and group IDs are persistent opaque strings. Group order and
`playerIds` order are meaningful. Group references must point to existing
players, must not duplicate an ID, and must respect `maxPlayers` when present.
Player numbers remain strings so `"0"` and `"00"` stay distinct.

Player media references are strings, not embedded data. Photos are PNG, JPEG or
WebP; intro videos are MP4 or WebM. `featuredStats` selects at most four known
statistics for that player's card. Missing media is retained and surfaced by
the controller so it can be relinked.

## What is not stored

`.pictateam` never stores event statistics, current live-group membership,
current cue, playback position, monitor selection, output layout or window
geometry. Those belong to the `.picta` show or to local preferences. Opening a
team for a new event therefore starts with a clean event state.

## Paths and validation

Media paths are stored relative to the `.pictateam` file whenever practical and
use forward slashes. The Rust boundary accepts only the documented file
extensions; a path in JSON is not an arbitrary filesystem grant. Invalid JSON,
unknown sports, duplicate IDs, missing group references, invalid colors and
unsupported media extensions are rejected with a controller-side message.

Version 1 is the current format. Newer versions are rejected clearly rather
than guessed at.
